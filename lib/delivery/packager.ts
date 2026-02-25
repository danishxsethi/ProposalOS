import { ValidatedArtifact } from './validationPipeline';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGenerator } from './generators';

// Import Finding type from Prisma client
type Finding = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  impactScore: number;
  [key: string]: any;
};

export interface ImplementationPackage {
  artifactId: string;
  findingId: string;
  artifactContent: string;
  artifactType: string;
  installationInstructions: string;
  beforePreview?: string;
  afterPreview?: string;
  estimatedImpact: string;
  wordpressPlugin?: string;
}

/**
 * Package a validated artifact with installation instructions and impact estimates
 */
export async function packageArtifact(
  artifact: ValidatedArtifact,
  finding: Finding,
  context: Record<string, any> = {}
): Promise<ImplementationPackage> {
  // Generate installation instructions via LLM (flash model, no thinking budget)
  const instructions = await generateInstallationInstructions(artifact, finding, context);

  // Generate before/after preview where applicable
  const { beforePreview, afterPreview } = generatePreviews(artifact, finding);

  // Assign estimated impact label from finding's impactScore
  const estimatedImpact = getImpactLabel(finding.impactScore);

  // Generate WordPress plugin if applicable
  let wordpressPlugin: string | undefined;
  const generator = getGenerator(finding.category);
  if (generator && generator.supportsWordPress && generator.supportsWordPress() && generator.generateWordPressPlugin) {
    try {
      wordpressPlugin = await generator.generateWordPressPlugin(finding as any, artifact);
    } catch (error) {
      console.error('Failed to generate WordPress plugin:', error);
    }
  }

  return {
    artifactId: artifact.metadata.findingId,
    findingId: finding.id,
    artifactContent: artifact.content,
    artifactType: artifact.artifactType,
    installationInstructions: instructions,
    beforePreview,
    afterPreview,
    estimatedImpact,
    wordpressPlugin,
  };
}

/**
 * Generate installation instructions via LLM
 */
async function generateInstallationInstructions(
  artifact: ValidatedArtifact,
  finding: Finding,
  context: Record<string, any>
): Promise<string> {
  const prompt = `Generate clear, step-by-step installation instructions for the following artifact.
The instructions should be copy-paste ready and suitable for non-technical users.

Artifact Type: ${artifact.artifactType}
Finding: ${finding.title}
Description: ${finding.description || 'N/A'}

Artifact Content:
\`\`\`
${artifact.content.substring(0, 500)}...
\`\`\`

Provide concise, numbered steps that a non-technical person can follow.`;

  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return 'See artifact content for implementation details.';
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    return response || 'See artifact content for implementation details.';
  } catch (error) {
    console.error('Failed to generate installation instructions:', error);
    return 'See artifact content for implementation details.';
  }
}

/**
 * Generate before/after preview strings
 */
function generatePreviews(
  artifact: ValidatedArtifact,
  finding: Finding
): { beforePreview?: string; afterPreview?: string } {
  const beforePreview = `Before: ${finding.title} issue not addressed`;

  let afterPreview: string | undefined;

  switch (artifact.artifactType) {
    case 'json_ld':
      afterPreview = 'After: Rich snippet markup added to search results';
      break;
    case 'html_meta':
      afterPreview = 'After: Improved meta tags for better SEO and social sharing';
      break;
    case 'speed_script':
      afterPreview = 'After: Optimized performance with faster load times';
      break;
    case 'gbp_draft':
      afterPreview = 'After: Enhanced Google Business Profile with complete information';
      break;
    case 'content_brief':
      afterPreview = 'After: New content addressing identified gaps';
      break;
    case 'aria_fix':
      afterPreview = 'After: Improved accessibility for all users';
      break;
    default:
      afterPreview = 'After: Issue addressed with provided artifact';
  }

  return { beforePreview, afterPreview };
}

/**
 * Get impact label from impact score
 */
function getImpactLabel(impactScore: number): string {
  if (impactScore >= 80) {
    return 'High Impact';
  }
  if (impactScore >= 50) {
    return 'Medium Impact';
  }
  return 'Low Impact';
}
