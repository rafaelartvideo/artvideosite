import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminDialog, BtnPrimary } from "@/shared/ui/admin/AdminLayout";
import {
  acceptOrganizationTerm,
  type PendingOrganizationTerm,
} from "../infrastructure/terms.repository";

function renderInlineMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-extrabold text-[#17263b]">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function FormattedTermContent({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  const isSpecialLine = (line: string) =>
    /^#{1,3}\s+/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^>\s?/.test(line);

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const headingText = heading[2];

      if (level === 1) {
        blocks.push(
          <h1 key={index} className="mb-5 text-xl font-black leading-tight tracking-[-0.02em] text-[#0d1b2e] sm:text-2xl">
            {renderInlineMarkdown(headingText)}
          </h1>,
        );
      } else if (level === 2) {
        blocks.push(
          <h2 key={index} className="mb-2 mt-7 border-b border-[#dfe6f0] pb-2 text-[15px] font-black leading-6 text-[#0d1b2e] first:mt-0 sm:text-base">
            {renderInlineMarkdown(headingText)}
          </h2>,
        );
      } else {
        blocks.push(
          <h3 key={index} className="mb-1.5 mt-5 text-sm font-extrabold leading-6 text-[#1d2d43]">
            {renderInlineMarkdown(headingText)}
          </h3>,
        );
      }

      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      const start = index;
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={start} className="my-3 list-disc space-y-2 pl-5 text-sm leading-7 text-[#35465c] marker:text-[#0057e7]">
          {items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      const start = index;
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={start} className="my-3 list-decimal space-y-2 pl-5 text-sm leading-7 text-[#35465c] marker:font-bold marker:text-[#0057e7]">
          {items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}
        </ol>,
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      const start = index;
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={start} className="my-4 border-l-[3px] border-[#0057e7] bg-[#f5f8fd] px-4 py-3 text-sm font-medium leading-7 text-[#35465c]">
          {renderInlineMarkdown(quoteLines.join(" "))}
        </blockquote>,
      );
      continue;
    }

    const paragraphLines = [line];
    const start = index;
    index += 1;

    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || isSpecialLine(next)) break;
      paragraphLines.push(next);
      index += 1;
    }

    blocks.push(
      <p key={start} className="my-3 text-sm leading-7 text-[#35465c]">
        {renderInlineMarkdown(paragraphLines.join(" "))}
      </p>,
    );
  }

  return (
    <article className="mx-auto w-full max-w-[760px] px-1 py-1 sm:px-2">
      {blocks}
    </article>
  );
}

export function TermsAcceptanceGate({
  initialPending,
}: {
  initialPending: PendingOrganizationTerm[];
}) {
  const { activeOrganizationId } = useAuth();
  const [pending, setPending] = useState<PendingOrganizationTerm[]>(initialPending);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPending(initialPending);
    setAccepted(false);
    setError("");
  }, [activeOrganizationId, initialPending]);

  const current = pending[0] || null;

  useEffect(() => {
    setAccepted(false);
    setError("");
  }, [current?.id, current?.version]);

  const confirm = async () => {
    if (!current || !activeOrganizationId || !accepted || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      await acceptOrganizationTerm(activeOrganizationId, current.id, current.version);
      setPending(items => items.slice(1));
    } catch (requestError) {
      setError(systemErrorMessage(requestError, "Não foi possível registrar o aceite."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!current) return null;

  return <AdminDialog
    open
    onClose={() => undefined}
    title={current.title}
    description={`${current.organization_name} · versão ${current.version}`}
    minimizable={false}
    className="max-w-3xl"
    footer={<div>
      {error && <p className="mb-3 text-sm font-semibold text-red-600">{error}</p>}
      <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold leading-5 text-[#35465c]">
        <input
          type="checkbox"
          checked={accepted}
          onChange={event => setAccepted(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#0057e7]"
        />
        <span>
          Li e concordo com {current.term_type === "usage" ? "os Termos de Uso" : "o Termo de Responsabilidade"} apresentados acima.
        </span>
      </label>

      <div className="mt-4 flex justify-end">
        <BtnPrimary
          onClick={() => void confirm()}
          disabled={!accepted || submitting}
          loading={submitting}
          loadingText="Registrando aceite..."
        >
          Aceitar e continuar
        </BtnPrimary>
      </div>
    </div>}
  >
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">
        {current.term_type === "usage" ? "Aceite do proprietário" : "Aceite individual"}
      </p>
      <FormattedTermContent content={current.content} />
    </div>
  </AdminDialog>;
}
