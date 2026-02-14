/**
 * useModalState - Unified modal state management
 * Replaces duplicated modal state patterns across feed screens
 */

import { useState, useCallback } from 'react';

// ============================================
// TYPES
// ============================================

interface ModalState<T> {
  /** Whether the modal is visible */
  isVisible: boolean;
  /** Data associated with the modal */
  data: T | null;
  /** Open the modal with optional data */
  open: (data?: T) => void;
  /** Close the modal */
  close: () => void;
  /** Toggle the modal */
  toggle: () => void;
  /** Set data without opening */
  setData: (data: T | null) => void;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

/**
 * Hook for managing modal visibility and associated data
 *
 * @example
 * ```tsx
 * // Basic usage
 * const { isVisible, open, close } = useModalState();
 *
 * // With data
 * const shareModal = useModalState<{ postId: string; media: string }>();
 *
 * // Open with data
 * shareModal.open({ postId: '123', media: 'https://...' });
 *
 * // In render
 * <ShareModal
 *   visible={shareModal.isVisible}
 *   post={shareModal.data}
 *   onClose={shareModal.close}
 * />
 * ```
 */
export function useModalState<T = undefined>(
  initialVisible = false,
  initialData: T | null = null
): ModalState<T> {
  const [isVisible, setIsVisible] = useState(initialVisible);
  const [data, setData] = useState<T | null>(initialData);

  const open = useCallback((newData?: T) => {
    if (newData !== undefined) {
      setData(newData);
    }
    setIsVisible(true);
  }, []);

  const close = useCallback(() => {
    setIsVisible(false);
    // Optionally clear data after animation
    // setTimeout(() => setData(null), 300);
  }, []);

  const toggle = useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  return {
    isVisible,
    data,
    open,
    close,
    toggle,
    setData,
  };
}

// ============================================
// SPECIALIZED MODAL HOOKS
// ============================================

/**
 * Share content types supported by the in-app share modal
 */
export type ShareContentType = 'post' | 'peak' | 'profile' | 'text';

/**
 * Share modal state with generic content data structure
 */
export interface ShareContentData {
  id: string;
  type: ShareContentType;
  /** Display title (author name for post/peak, full name for profile, message title for text) */
  title: string;
  /** Display subtitle (caption for post, username for profile, description for text) */
  subtitle?: string;
  /** Primary image (media for post/peak, avatar for profile) */
  image?: string | null;
  /** Author avatar (for post/peak where image is the media) */
  avatar?: string | null;
  /** Pre-formatted text message (for 'text' type: activities, events, bookings, live stats) */
  shareText?: string;
}

export function useShareModal() {
  return useModalState<ShareContentData>();
}

/**
 * Menu modal state for post actions
 */
export interface MenuPostData {
  id: string;
  userId: string;
  isOwnPost: boolean;
}

export function useMenuModal() {
  return useModalState<MenuPostData>();
}

/**
 * Confirmation modal state
 */
export interface ConfirmationData {
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export function useConfirmationModal() {
  return useModalState<ConfirmationData>();
}

/**
 * Image viewer modal state
 */
export interface ImageViewerData {
  images: string[];
  initialIndex?: number;
}

export function useImageViewerModal() {
  return useModalState<ImageViewerData>();
}

// ============================================
// MULTIPLE MODALS MANAGEMENT
// ============================================

type ModalName = string;

interface MultiModalState {
  /** Currently open modal name */
  activeModal: ModalName | null;
  /** Data for each modal */
  modalData: Record<ModalName, unknown>;
  /** Check if a specific modal is open */
  isOpen: (name: ModalName) => boolean;
  /** Open a modal with data */
  open: <T>(name: ModalName, data?: T) => void;
  /** Close a specific modal or all modals */
  close: (name?: ModalName) => void;
  /** Get data for a specific modal */
  getData: <T>(name: ModalName) => T | undefined;
}

/**
 * Hook for managing multiple modals (only one open at a time)
 *
 * @example
 * ```tsx
 * const modals = useMultiModal();
 *
 * // Open share modal
 * modals.open('share', { postId: '123' });
 *
 * // Check if open
 * if (modals.isOpen('share')) { ... }
 *
 * // Close
 * modals.close();
 * ```
 */
export function useMultiModal(): MultiModalState {
  const [activeModal, setActiveModal] = useState<ModalName | null>(null);
  const [modalData, setModalData] = useState<Record<ModalName, unknown>>({});

  const isOpen = useCallback(
    (name: ModalName) => activeModal === name,
    [activeModal]
  );

  const open = useCallback(<T,>(name: ModalName, data?: T) => {
    if (data !== undefined) {
      setModalData((prev) => ({ ...prev, [name]: data }));
    }
    setActiveModal(name);
  }, []);

  const close = useCallback((name?: ModalName) => {
    if (name === undefined || activeModal === name) {
      setActiveModal(null);
    }
  }, [activeModal]);

  const getData = useCallback(
    <T,>(name: ModalName): T | undefined => {
      return modalData[name] as T | undefined;
    },
    [modalData]
  );

  return {
    activeModal,
    modalData,
    isOpen,
    open,
    close,
    getData,
  };
}

export default useModalState;
