import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

export type CustomerFeedback = { message: string; type: "success" | "error"; id: number };

export function CustomerFeedbackToast({ feedback, onDismiss }: {
  feedback: CustomerFeedback | null;
  onDismiss: () => void;
}) {
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [feedback, onDismiss]);

  return <AnimatePresence mode="wait">
    {feedback && <motion.div
      key={feedback.id}
      role={feedback.type === "error" ? "alert" : "status"}
      aria-live={feedback.type === "error" ? "assertive" : "polite"}
      initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
      className="fixed bottom-5 left-4 right-4 z-[100] mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-[#dce6f2] bg-white px-4 py-3 text-[13px] font-medium text-[#24405e] shadow-[0_12px_42px_rgba(18,47,83,.16)] sm:bottom-7 sm:left-auto sm:right-7 sm:mx-0 sm:max-w-[410px]">
      {feedback.type === "success" ?
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600"/> :
        <CircleAlert size={20} className="mt-0.5 shrink-0 text-red-600"/>}
      <span className="min-w-0 flex-1 leading-5">{feedback.message}</span>
      <button type="button" onClick={onDismiss} aria-label="Fechar notificação" className="-mr-1 -mt-1 rounded-md p-1.5 text-[#94a3b8] hover:bg-[#f3f6fa] hover:text-[#315077]"><X size={16}/></button>
    </motion.div>}
  </AnimatePresence>;
}
