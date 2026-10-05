'use client';

import { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { readAndClearRestore } from '@/lib/restore-session';

interface ModalContextType {
  isOpen: boolean;
  postId: string | null;
  postIds: string[];
  currentIndex: number;
  openModal: (postId: string, postIds: string[]) => void;
  closeModal: () => void;
  navigateToPost: (direction: 'next' | 'prev') => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);
  const [postIds, setPostIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const modalRestoreKeyRef = useRef<string | null>(null);

  const openModal = useCallback((id: string, ids: string[]) => {
    try {
      const key = sessionStorage.getItem('lastSectionKey/latest');
      modalRestoreKeyRef.current = key && sessionStorage.getItem(`anchorPostId-${key}/latest`) === id ? key : null;
    } catch { modalRestoreKeyRef.current = null; }
    setPostIds(ids);
    const index = ids.findIndex(i => i === id);
    setPostId(id);
    setCurrentIndex(index);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (modalRestoreKeyRef.current) readAndClearRestore(modalRestoreKeyRef.current);
    modalRestoreKeyRef.current = null;
    setIsOpen(false);
    setPostId(null);
    setPostIds([]);
    setCurrentIndex(-1);
  }, []);

  const navigateToPost = useCallback((direction: 'next' | 'prev') => {
    if (postIds.length === 0 || currentIndex === -1) return;

    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    if (nextIndex >= 0 && nextIndex < postIds.length) {
      setCurrentIndex(nextIndex);
      setPostId(postIds[nextIndex]);
    }
  }, [currentIndex, postIds]);

  return (
    <ModalContext.Provider value={{ isOpen, postId, postIds, currentIndex, openModal, closeModal, navigateToPost }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
