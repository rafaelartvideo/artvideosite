import { useEffect, useState } from "react";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, LockKeyhole, RotateCcw } from "lucide-react";
// ... existing imports and component code remain unchanged ...

      <div className="sticky bottom-0 border-t border-[#0d1b2e]/8 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <BtnSecondary onClick={onClose}>Voltar para a OS</BtnSecondary>
          {/* O botão de conexão com celular deve usar aqui o mesmo componente/mecanismo
              já utilizado nas demais telas da OS. */}
        </div>
      </div>
    </AdminPage>
  );
}
