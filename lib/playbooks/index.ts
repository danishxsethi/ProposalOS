/**
 * Vertical playbook system — industry-specific audit and proposal customization.
 */
export * from './types';
export {
    PLAYBOOK_REGISTRY,
    DEFAULT_PLAYBOOK_ID,
    detectVertical,
    getPlaybook,
    type DetectVerticalInput,
} from './registry';
