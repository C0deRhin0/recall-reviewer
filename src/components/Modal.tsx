"use client";
import { useEffect, useRef } from "react";
export default function Modal({
  children,
  titleId,
  onClose,
}: {
  children: React.ReactNode;
  titleId: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal-backdrop"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
// Refine the surrounding context for modal module
// Align local documentation for modal module
