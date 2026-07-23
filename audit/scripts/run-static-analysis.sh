#!/bin/bash

# Create output directory
mkdir -p audit/reports

echo "Running Static Analysis..."
echo "=========================="

echo "1. Checking Linting..."
npm run lint > audit/reports/lint_report.txt 2>&1
if [ $? -eq 0 ]; then
    echo "Linting Passed"
else
    echo "Linting Failed (see audit/reports/lint_report.txt)"
fi

echo "2. Checking Type Safety..."
npx tsc --noEmit > audit/reports/tsc_report.txt 2>&1
if [ $? -eq 0 ]; then
    echo "Type Check Passed"
else
    echo "Type Check Failed (see audit/reports/tsc_report.txt)"
fi

echo "3. Checking Dependencies..."
npm audit > audit/reports/npm_audit_report.txt 2>&1
if [ $? -eq 0 ]; then
    echo "Dependency Check Passed"
else
    echo "Dependency Check Failed (see audit/reports/npm_audit_report.txt)"
fi

echo "Analysis Complete. Reports saved to audit/reports/"
