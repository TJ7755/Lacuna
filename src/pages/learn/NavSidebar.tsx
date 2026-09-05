import { AnimatePresence, m as motion } from 'motion/react';
import { ShellCourseDataProvider } from '../../state/ShellCourseData';
import { Sidebar } from '../../components/layout/Sidebar';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export function NavSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const trapRef = useFocusTrap(open);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={trapRef}
          role="dialog"
          aria-label="Navigation"
          aria-modal="true"
          className="fixed inset-0 z-40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="absolute inset-y-0 left-0"
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <ShellCourseDataProvider>
              <Sidebar collapsed={false} onToggleCollapsed={onClose} />
            </ShellCourseDataProvider>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
