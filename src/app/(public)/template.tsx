import PageTransition from "@/components/motion/PageTransition";

/**
 * Public route group template.
 *
 * Templates re-render on every navigation (unlike layouts which persist).
 * This makes template.tsx the correct host for AnimatePresence page transitions.
 */
export default function PublicTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageTransition>{children}</PageTransition>;
}
