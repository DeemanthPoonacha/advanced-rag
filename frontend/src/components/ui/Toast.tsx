import { ToastState } from "../../types";

interface ToastProps {
  toast: ToastState | null;
}

export function Toast({ toast }: ToastProps) {
  if (!toast) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold shadow-lg text-white animate-fade-in transition-all duration-300 ${
        toast.type === "success"
          ? "bg-emerald-600 shadow-emerald-950/20"
          : "bg-rose-600 shadow-rose-950/20"
      }`}
    >
      {toast.text}
    </div>
  );
}
