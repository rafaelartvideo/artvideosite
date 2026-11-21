/** A RPC paginada já retorna o total global quando não há restrições. */
export function registrationPageHasGlobalTotal({nameSearch='',documentSearch='',role='all',status='all',creatorFilter='all',createdDate='',employeeOnly=false}={}) {
 return !nameSearch && !documentSearch && role==='all' && status==='all' && creatorFilter==='all' && !createdDate && !employeeOnly;
}
