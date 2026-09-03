import { supabase } from "@/lib/supabase";

export async function sendOrderDocumentEmail({
  orderId,
  documentName,
  documentHtml,
}: {
  orderId: string;
  documentName: string;
  documentHtml: string;
}) {
  const { data, error } = await supabase.functions.invoke("send-order-document-email", {
    body: {
      order_id: orderId,
      document_name: documentName,
      document_html: documentHtml,
    },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || "Não foi possível enviar o documento.");
  return data as { success: true; recipient: string };
}
