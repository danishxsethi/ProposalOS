$ErrorActionPreference = 'Stop'

$sourceProject = 'proposal-487522'
$targetRegion = 'us-east-2'
$targetPrefix = 'proposalos/app/production/'
$sourceNames = @(
    'ADMIN_SECRET'
    'API_KEY'
    'AUDIT_TRAIL_ENCRYPTION_KEY'
    'CRON_SECRET'
    'FIELD_ENCRYPTION_KEY_ID'
    'FIELD_ENCRYPTION_PRIMARY_KEY'
    'INTERNAL_OPS_KEY'
    'NEXTAUTH_SECRET'
    'RESEND_API_KEY'
    'SERP_API_KEY'
    'STRIPE_SECRET_KEY'
    'STRIPE_WEBHOOK_SECRET'
)

$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
$transferDir = [System.IO.Path]::GetFullPath((Join-Path $tempRoot ('proposalos-secret-transfer-' + [guid]::NewGuid().ToString('N'))))
if (-not $transferDir.StartsWith($tempRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Temporary secret directory is outside the user temp root.'
}

New-Item -ItemType Directory -Path $transferDir -ErrorAction Stop | Out-Null
try {
    $userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $systemSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($userSid)
    foreach ($sid in @($userSid, $systemSid)) {
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
            $sid,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit,
            [System.Security.AccessControl.PropagationFlags]::None,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $transferDir -AclObject $acl

    $awsExe = (Get-Command aws).Source
    $seeded = 0
    foreach ($name in $sourceNames) {
        $enabledVersion = & gcloud secrets versions list $name "--project=$sourceProject" --filter='state=ENABLED' --sort-by='~createTime' --limit=1 --format='value(name)' 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $enabledVersion) {
            throw "No enabled GCP source version is available for $name."
        }

        $secretFile = Join-Path $transferDir ($name + '.secret')
        & gcloud secrets versions access $enabledVersion "--secret=$name" "--project=$sourceProject" "--out-file=$secretFile" 2>$null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $secretFile)) {
            throw "Could not retrieve the GCP source value for $name."
        }
        if ((Get-Item -LiteralPath $secretFile).Length -eq 0) {
            throw "The GCP source value for $name is empty."
        }

        $versionId = & $awsExe secretsmanager put-secret-value --region $targetRegion --secret-id ($targetPrefix + $name) --secret-string ('file://' + $secretFile) --query VersionId --output text 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $versionId) {
            throw "AWS did not accept the production secret value for $name."
        }
        Remove-Item -LiteralPath $secretFile -Force
        $seeded++
    }

    $randomBytes = [byte[]]::new(48)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($randomBytes)
        $workerSecret = [Convert]::ToBase64String($randomBytes)
    }
    finally {
        $rng.Dispose()
    }

    $workerFile = Join-Path $transferDir 'WORKER_SECRET.secret'
    [System.IO.File]::WriteAllText($workerFile, $workerSecret, [System.Text.UTF8Encoding]::new($false))
    $workerVersion = & $awsExe secretsmanager put-secret-value --region $targetRegion --secret-id ($targetPrefix + 'WORKER_SECRET') --secret-string ('file://' + $workerFile) --query VersionId --output text 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $workerVersion) {
        throw 'AWS did not accept the generated production WORKER_SECRET.'
    }
    Remove-Item -LiteralPath $workerFile -Force
    $seeded++

    Write-Output ("Seeded {0} production runtime secret versions; secret values were not printed." -f $seeded)
}
finally {
    if (Test-Path -LiteralPath $transferDir) {
        $resolved = (Resolve-Path -LiteralPath $transferDir).ProviderPath
        if ($resolved -ne $transferDir -or -not $resolved.StartsWith($tempRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'Refusing to remove an unexpected temporary secret directory.'
        }
        Get-ChildItem -LiteralPath $resolved -File | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
        Remove-Item -LiteralPath $resolved -Force
    }
}
