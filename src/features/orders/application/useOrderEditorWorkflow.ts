import { useRef, type Dispatch, type SetStateAction } from "react";
import { buildOrderPayload, buildTechnicalValuesPayload, prepareOrderForm } from "./order-form";
import { getOrderEditState, getOrderSubmissionStatus } from "./order-management";
import { persistServiceOrder } from "./order-submission";
import { uploadOrderImage } from "../infrastructure/order-images.repository";
import { listServiceOrderTechnicalValues, saveServiceOrderTechnicalValues } from "../infrastructure/orders.repository";
import { getOrderDeviceUnlockMeta, saveOrderDeviceUnlock } from "../infrastructure/order-device-unlock.repository";
import { clearNewOrderEntryChecklistDraft, persistNewOrderEntryChecklist, validateNewOrderEntryChecklist } from "@/features/checklists/application/new-order-entry-checklist";
import type { useOrderCustomerPersistence } from "./useOrderCustomerPersistence";
import type { useOrderCustomerSelection } from "./useOrderCustomerSelection";
import type { useOrderFormState } from "./useOrderFormState";
import type { useOrderImages } from "./useOrderImages";
import type { useOrdersWorkspace } from "./useOrdersWorkspace";
import type { useOrderServiceAddress } from "./useOrderServiceAddress";
import { useAuth } from "@/lib/auth";
import { assertEmployeeScheduleAvailable } from "@/features/appointments/infrastructure/employee-agenda.repository";
type PermissionCheck=(permission:string)=>boolean; type Toast={msg:string;type:"success"|"error"};
type Options={userId?:string;workspace:ReturnType<typeof useOrdersWorkspace>;formState:ReturnType<typeof useOrderFormState>;images:ReturnType<typeof useOrderImages>;customers:ReturnType<typeof useOrderCustomerSelection>;address:ReturnType<typeof useOrderServiceAddress>;customerPersistence:ReturnType<typeof useOrderCustomerPersistence>;hasPermission:PermissionCheck;showToast:Dispatch<SetStateAction<Toast|null>>;setSaving:Dispatch<SetStateAction<boolean>>;formatError:(error:unknown)=>string;organizationIdOverride?:string|null;};
export function useOrderEditorWorkflow({userId,workspace,formState,images,customers,address,customerPersistence,hasPermission,showToast,setSaving,formatError,organizationIdOverride}:Options){
 const {activeOrganizationId}=useAuth(); const organizationId=organizationIdOverride||activeOrganizationId; const saveInFlightRef=useRef(false); const creationRequestIdRef=useRef<string|null>(null); const initialTechnicalValuesRef=useRef<Array<Record<string,unknown>>>([]);
 const selectCustomer=(customer:any)=>{const customerAddress=customers.selectCustomer(customer);formState.updateField("customer_id",customer.id);if(customerAddress){address.setServiceAddressMessage("");address.setServiceCustomerAddressOverride(true);address.copyCustomerAddressToForm(customerAddress);if(formState.form.order_type==="external")address.setServiceUseCustomerAddress(true);return;}address.clearServiceAddress();if(formState.form.order_type==="external"){address.setServiceUseCustomerAddress(false);address.setServiceAddressMessage("Este cliente não possui endereço cadastrado. Preencha o local do atendimento.");}};
 const openNew=(queueContext?:{reservationId?:string|null;ticketNumber?:string|null;overrideReason?:string|null})=>{initialTechnicalValuesRef.current=[];if(!organizationId){showToast({msg:"Selecione uma empresa antes de criar uma OS.",type:"error"});return;}clearNewOrderEntryChecklistDraft();creationRequestIdRef.current=crypto.randomUUID();formState.openNewForm();if(queueContext){formState.setForm(current=>({...current,queue_reservation_id:queueContext.reservationId||"",queue_ticket_number:queueContext.ticketNumber||"",queue_override_reason:queueContext.overrideReason||""}));}address.resetServiceAddressState();images.clearOrderImages();images.setViewImage(null);customers.clearCustomer();};
 const openEdit=async(order:any)=>{creationRequestIdRef.current=null;clearNewOrderEntryChecklistDraft();if(!organizationId||order.organization_id!==organizationId){showToast({msg:"Esta OS não pertence à empresa selecionada.",type:"error"});return false;}try{const{data:currentOrder,error}=await getOrderEditState(order.id);if(error){showToast({msg:`Não foi possível verificar o estado da OS: ${formatError(error)}`,type:"error"});return false;}if(currentOrder?.is_solved||order.is_solved){showToast({msg:"Esta OS está solucionada e é somente leitura.",type:"error"});return false;}const[,technicalResponse,unlockMeta]=await Promise.all([images.loadOrderImages(order.id),listServiceOrderTechnicalValues(order.id),(hasPermission("orders.unlock.view")||hasPermission("orders.unlock.manage"))?getOrderDeviceUnlockMeta(order.id).catch(()=>null):Promise.resolve(null)]);const{data:technicalValues,error:technicalValuesError}=technicalResponse;if(technicalValuesError){showToast({msg:`Não foi possível carregar os campos técnicos: ${formatError(technicalValuesError)}`,type:"error"});return false;}initialTechnicalValuesRef.current=(technicalValues||[]) as Array<Record<string,unknown>>;formState.hydrateOrderForm(order,technicalValues||[]);if(unlockMeta){formState.setForm(current=>({...current,unlock_type:unlockMeta.type||"none",unlock_has_existing:unlockMeta.has_value}));}address.hydrateServiceAddress({useCustomerAddress:order.order_type==="external"&&order.service_address_source==="customer",state:order.order_type==="external"?order.service_state:undefined,city:order.order_type==="external"?order.service_city:undefined});customers.hydrateCustomer(order.customer||null);return true;}catch(error){showToast({msg:`Não foi possível abrir a edição da OS: ${formatError(error)}`,type:"error"});return false;}};
 const save=async()=>{if(saveInFlightRef.current)return false;saveInFlightRef.current=true;try{
  if(!organizationId){showToast({msg:"Selecione uma empresa antes de salvar a OS.",type:"error"});return false;}const editingOrder=formState.editingOS;if(editingOrder?.organization_id&&editingOrder.organization_id!==organizationId){showToast({msg:"A empresa da OS não pode ser alterada.",type:"error"});return false;}if(editingOrder?!hasPermission("orders.edit"):!hasPermission("orders.create")){showToast({msg:"Você não possui permissão para esta ação na OS.",type:"error"});return false;}
  if(formState.hasAccessories&&!String(formState.form.accessories||"").trim()){showToast({msg:"Descreva os acessórios da OS ou selecione Não.",type:"error"});return false;}
  const unlock=formState.form;
  if(unlock.unlock_dirty){
    if(!hasPermission("orders.unlock.manage")){showToast({msg:"Você não possui permissão para registrar o desbloqueio.",type:"error"});return false;}
    if(unlock.unlock_type!=="none"){
      const value=String(unlock.unlock_value||"");
      const valid=unlock.unlock_type==="pin"?/^[0-9]{4,12}$/.test(value):unlock.unlock_type==="pattern"?/^[1-9]{4,9}$/.test(value)&&new Set(value).size===value.length:unlock.unlock_type==="password"?value.length>=1&&value.length<=64:false;
      if(!valid){showToast({msg:"Informe um código válido: PIN (4 a 12 dígitos), senha ou desenho com pelo menos 4 pontos.",type:"error"});return false;}
    }
  }
  if(!editingOrder){if(!images.orderImages.some(image=>image.kind==="label")){showToast({msg:"Adicione a foto da etiqueta do equipamento antes de salvar a OS.",type:"error"});return false;}const checklistError=validateNewOrderEntryChecklist();if(checklistError){showToast({msg:checklistError,type:"error"});return false;}}
  const technicalFields=workspace.technicalFieldLinks.filter((link:any)=>link.equipment_type_id===formState.form.equipment_type_id).map((link:any)=>({...link,technical_field:link.technical_field||workspace.technicalFields.find((field:any)=>field.id===link.technical_field_id)}));
  const preparation=prepareOrderForm({form:formState.form,editingOrder,userId,selectedCustomerId:customers.selectedCustomer?.id,serviceUseCustomerAddress:address.serviceUseCustomerAddress,serviceCustomerAddressOverride:address.serviceCustomerAddressOverride,selectedServiceAddress:address.selectedServiceAddress,needsScheduling:formState.needsScheduling,equipmentBrands:workspace.equipmentBrands,equipmentModels:workspace.equipmentModels,technicalFields,technicalValues:formState.form.technicalValues});if("error" in preparation){showToast({msg:preparation.error,type:"error"});return false;}
  if (formState.needsScheduling) {
    const technicianIds = Array.from(new Set(formState.selectedTechnicianIds));
    if (!technicianIds.length) { showToast({ msg: "Selecione o técnico para consultar a agenda.", type: "error" }); return false; }
    try {
      await Promise.all(technicianIds.map(technicianId =>
        assertEmployeeScheduleAvailable(organizationId, technicianId, formState.form.scheduled_at, formState.form.scheduled_end_at, editingOrder?.id),
      ));
    } catch (scheduleError) {
      showToast({ msg: `Não foi possível confirmar o agendamento: ${formatError(scheduleError)}`, type: "error" });
      return false;
    }
  }
  setSaving(true);const{status,error:statusError}=await getOrderSubmissionStatus({organizationId,editingOrder,statusId:formState.form.status_id,availableStatuses:workspace.statuses});if(statusError||!status?.id){showToast({msg:"Não foi possível identificar um status válido para a OS.",type:"error"});return false;}if(customers.editingCustomer&&customers.selectedCustomer?.id&&!(await customerPersistence.saveCustomerBeforeOrder()))return false;
  const payload=buildOrderPayload({form:formState.form,editingOrder,userId,statusId:status.id,prepared:preparation.prepared,selectedTechnicianIds:formState.selectedTechnicianIds,selectedSellerIds:formState.selectedSellerIds,needsScheduling:formState.needsScheduling,serviceUseCustomerAddress:address.serviceUseCustomerAddress});if(!editingOrder&&!creationRequestIdRef.current)creationRequestIdRef.current=crypto.randomUUID();const technicalValues=buildTechnicalValuesPayload({serviceOrderId:editingOrder?.id||creationRequestIdRef.current||"00000000-0000-0000-0000-000000000000",technicalFields,technicalValues:formState.form.technicalValues});
  const submission=await persistServiceOrder({organizationId,editingOrder,pendingOrderId:formState.pendingCreatedOrderId,creationRequestId:creationRequestIdRef.current,payload,selectedTechnicianIds:formState.selectedTechnicianIds,selectedSellerIds:formState.selectedSellerIds,technicalValues,originalTechnicalValues:editingOrder?initialTechnicalValuesRef.current:undefined,orderImages:images.orderImages,uploadImage:(file,kind)=>uploadOrderImage(file,organizationId,kind==="label"?"label":"equipment",editingOrder?.id),onImageUploaded:images.markOrderImageUploaded,saveTechnicalValues:async (orderId,changedValues)=>saveServiceOrderTechnicalValues(orderId,changedValues.map(({service_order_id:_ignored,...value})=>value))});
  if(!submission.success){if(!editingOrder&&submission.orderId)formState.setPendingCreatedOrderId(submission.orderId);const message=submission.stage==="record"?`Erro ao salvar OS: ${formatError(submission.error)}`:submission.stage==="technical"?`A OS não foi finalizada por erro nos campos técnicos: ${formatError(submission.error)}`:submission.stage==="relations"?`A OS não foi finalizada por erro nos técnicos/vendedores: ${formatError(submission.error)}`:`A OS não foi finalizada por erro nas imagens: ${formatError(submission.error)}`;showToast({msg:message,type:"error"});return false;}
  if(unlock.unlock_dirty&&(unlock.unlock_type!=="none"||unlock.unlock_has_existing)){
    try{await saveOrderDeviceUnlock(submission.orderId,unlock.unlock_type,unlock.unlock_value);formState.setForm(current=>({...current,unlock_dirty:false,unlock_value:"",unlock_has_existing:unlock.unlock_type!=="none"}));}
    catch(error){if(!editingOrder)formState.setPendingCreatedOrderId(submission.orderId);showToast({msg:"A OS foi salva, mas o desbloqueio não foi registrado: "+formatError(error),type:"error"});return false;}
  }
  if(!editingOrder){try{await persistNewOrderEntryChecklist(submission.orderId,organizationId);}catch(error){formState.setPendingCreatedOrderId(submission.orderId);showToast({msg:`A OS foi criada, mas o checklist de entrada precisa ser finalizado: ${formatError(error)}`,type:"error"});return false;}}
  creationRequestIdRef.current=null;formState.setPendingCreatedOrderId(null);if(editingOrder)showToast({msg:"OS atualizada com sucesso!",type:"success"});void workspace.reloadWorkspace().catch(error=>{console.warn("[OS] Falha ao atualizar cache após salvar:",error);});return submission.orderId;
 }finally{setSaving(false);saveInFlightRef.current=false;}};
 return{organizationId,selectCustomer,openNew,openEdit,save};
}
