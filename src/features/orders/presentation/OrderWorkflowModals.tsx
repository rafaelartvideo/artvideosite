import type { Dispatch, SetStateAction } from "react";
import { validateOrderResolution } from "../application/order-resolution";
import type { useOrderFormState } from "../application/useOrderFormState";
import type { useOrderImages } from "../application/useOrderImages";
import type { useOrderPartRequests } from "../application/useOrderPartRequests";
import type { useOrderResolution } from "../application/useOrderResolution";
import type { useOrderCompletion } from "../application/useOrderCompletion";
import type { useOrdersWorkspace } from "../application/useOrdersWorkspace";
import { OrderImageLightbox } from "./OrderImages";
import { OrderResolutionPage } from "./OrderResolutionPage";
import { OrderCompletionModal } from "./OrderCompletionModal";
import { QuickEquipmentModal } from "./OrderQuickCreateModals";
import { QuickCustomerModal } from "./QuickCustomerModal";
import {
  PartRequestModal,
  ReviewPartRequestModal,
  TestDeliveryModal,
  TestResultModal,
} from "./PartRequestModals";

type Toast = { msg: string; type: "success" | "error" };

type Props = {
  detail: any;
  saving: boolean;
  workspace: ReturnType<typeof useOrdersWorkspace>;
  formState: ReturnType<typeof useOrderFormState>;
  images: ReturnType<typeof useOrderImages>;
  resolution: ReturnType<typeof useOrderResolution>;
  completion: ReturnType<typeof useOrderCompletion>;
  partRequests: ReturnType<typeof useOrderPartRequests>;
  onSelectCustomer: (customer: any) => void;
  setToast: Dispatch<SetStateAction<Toast | null>>;
  formatCurrency: (value: number) => string;
};

export function OrderWorkflowModals({
  detail, saving, workspace, formState, images, resolution, completion,
  partRequests, onSelectCustomer: selectCustomer, setToast, formatCurrency,
}: Props) {
  const {
    setEquipmentTypes, setEquipmentBrands, setEquipmentModels,
  } = workspace;
  const {
    quickEquipment, setQuickEquipment, quickCustomer, setQuickCustomer,
    setForm,
  } = formState;
  const {
    orderImages, solutionImages, viewImage, setViewImage, addSolutionImages,
    removeSolutionImage,
  } = images;
  const {
    inventoryItems, solveOpen, setSolveOpen, solveDraft, setSolveDraft,
    saveOrderSolution,
  } = resolution;
  const {
    selectedPartRequest, partApprovalOpen, partRejectionOpen,
    approvalQuantities, partReviewNotes, setPartReviewNotes,
    partReviewSubmitting, partRequestOpen, partRequestInventory,
    partRequestInventoryLoading, partRequestInventoryError,
    selectedPartRequestItems, partRequestSearch, setPartRequestSearch,
    partRequestNotes, setPartRequestNotes, partRequestPurpose,
    setPartRequestPurpose, partRequestSubmitting, selectPartRequestItem,
    updatePartRequestQuantity, removePartRequestItem, closePartRequestModal,
    submitPartRequest, updateApprovalQuantity, closePartReview,
    approvePartRequest, rejectPartRequest, deliveryOpen,
    selectedDeliveryRequest, deliverySubmitting, closeDeliveryRequest,
    deliverTestRequest, testResultOpen, selectedTestRequest, testResultRows,
    setTestResultRows, testResultSubmitting, getTestPendingQuantity,
    closeTestResult, submitTestResults,
  } = partRequests;

  return <>
{quickEquipment && <QuickEquipmentModal
        onClose={() => setQuickEquipment(false)}
        onSaved={({ type, brand, model }) => {
          setEquipmentTypes(current => [...current, type]);
          setEquipmentBrands(current => [...current, brand]);
          setEquipmentModels(current => [...current, model]);
          setForm(current => ({ ...current, equipment_type_id: type.id, equipment_brand_id: brand.id, equipment_model_id: model.id }));
        }}
      />}
      {quickCustomer && <QuickCustomerModal
        onClose={() => setQuickCustomer(false)}
        onSaved={selectCustomer}
      />}
      <OrderResolutionPage
        open={solveOpen}
        detail={detail}
        solveDraft={solveDraft}
        setSolveDraft={setSolveDraft}
        inventoryItems={inventoryItems}
        orderImages={orderImages}
        solutionImages={solutionImages}
        onAddSolutionImages={addSolutionImages}
        onRemoveSolutionImage={removeSolutionImage}
        saving={saving}
        onClose={() => setSolveOpen(false)}
        onViewImage={setViewImage}
        onSubmit={() => {
          const validationError = validateOrderResolution(solveDraft, inventoryItems);
          if (validationError) {
            setToast({ msg: validationError, type: "error" });
            return;
          }
          void saveOrderSolution(detail.id);
        }}
      />
      <OrderCompletionModal detail={detail} usedItems={completion.usedItems} completion={completion} saving={saving} formatCurrency={formatCurrency} />
      {viewImage && <OrderImageLightbox image={viewImage} onClose={() => setViewImage(null)} />}
      {partRequestOpen && detail && (
        <PartRequestModal orderNumber={detail.os_number} inventoryItems={partRequestInventory} inventoryLoading={partRequestInventoryLoading} inventoryError={partRequestInventoryError} selectedItems={selectedPartRequestItems} search={partRequestSearch} notes={partRequestNotes} purpose={partRequestPurpose} submitting={partRequestSubmitting} onPurposeChange={setPartRequestPurpose} onSearchChange={setPartRequestSearch} onNotesChange={setPartRequestNotes} onSelect={selectPartRequestItem} onQuantityChange={updatePartRequestQuantity} onRemove={removePartRequestItem} onClose={closePartRequestModal} onSubmit={() => void submitPartRequest(detail.id)} />
      )}
      {partApprovalOpen && selectedPartRequest && detail && <ReviewPartRequestModal request={selectedPartRequest} orderNumber={detail.os_number} rejection={false} approvalQuantities={approvalQuantities} notes={partReviewNotes} submitting={partReviewSubmitting} onNotesChange={setPartReviewNotes} onQuantityChange={updateApprovalQuantity} onClose={closePartReview} onSubmit={approvePartRequest} />}
      {partRejectionOpen && selectedPartRequest && detail && <ReviewPartRequestModal request={selectedPartRequest} orderNumber={detail.os_number} rejection={true} approvalQuantities={approvalQuantities} notes={partReviewNotes} submitting={partReviewSubmitting} onNotesChange={setPartReviewNotes} onQuantityChange={updateApprovalQuantity} onClose={closePartReview} onSubmit={rejectPartRequest} />}
      {deliveryOpen && selectedDeliveryRequest && <TestDeliveryModal request={selectedDeliveryRequest} orderNumber={detail?.os_number} submitting={deliverySubmitting} onClose={closeDeliveryRequest} onSubmit={() => void deliverTestRequest()} />}
      {testResultOpen && selectedTestRequest && <TestResultModal request={selectedTestRequest} rows={testResultRows} submitting={testResultSubmitting} getPendingQuantity={getTestPendingQuantity} onRowsChange={setTestResultRows} onClose={closeTestResult} onSubmit={() => void submitTestResults()} />}
  </>;
}
