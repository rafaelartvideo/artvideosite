import {useEffect} from 'react';
import {useLocation} from 'react-router';
import {useIsFetching,useQueryClient} from '@tanstack/react-query';
import {useAuth} from '@/lib/auth';
import {prefetchAdminModule} from './admin-prefetch';
import {scheduleOrderCodeWarmup} from './admin-code-warmup.mjs';

export function AdminCodeWarmup(){
  const {pathname}=useLocation();
  const {loading,session,activeOrganizationId,hasPermission,hasModule}=useAuth();
  const fetching=useIsFetching();
  const queryClient=useQueryClient();
  const eligible=pathname==='/admin'&&!loading&&fetching===0&&Boolean(session&&activeOrganizationId)&&hasModule('orders')&&hasPermission('orders.view');
  useEffect(()=>scheduleOrderCodeWarmup(eligible,()=>{
    // CPU idle alone is insufficient: do not compete with initial Home data
    // or begin while the lazy admin shell is still opening.
    if(queryClient.isFetching()>0||!Array.from(document.querySelectorAll('h1')).some(node=>/^(Bom dia|Boa tarde|Boa noite)/i.test(node.textContent?.trim()||'')))return;
    prefetchAdminModule('orders');
  },window),[eligible,activeOrganizationId,queryClient]);
  return null;
}
