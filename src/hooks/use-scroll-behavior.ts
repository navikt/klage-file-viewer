import { useFileViewerConfig } from '@/context';

/**
 * Hook that returns the resolved `ScrollBehavior` value based on the user's
 * smooth scrolling preference.
 */
export const useScrollBehavior = (): ScrollBehavior => {
  const { smoothScrolling } = useFileViewerConfig();

  return smoothScrolling ? 'smooth' : 'instant';
};
