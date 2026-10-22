/** Anima o item até o ícone de carrinho, sem alterar a estrutura da página. */
export function animateProductToCart(source?: HTMLElement | null) {
  if (typeof document === "undefined" || !source || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cart = Array.from(document.querySelectorAll<HTMLElement>("[data-artvideo-cart]"))
    .find(element => element.getBoundingClientRect().width > 0);
  const picture = source.closest("article, section")?.querySelector<HTMLImageElement>("img");
  if (!cart || !picture?.currentSrc) return;
  const from = picture.getBoundingClientRect(), to = cart.getBoundingClientRect();
  if (!from.width || !from.height) return;
  const fly = document.createElement("img");
  fly.src = picture.currentSrc; fly.alt = ""; fly.setAttribute("aria-hidden", "true");
  Object.assign(fly.style, {position:"fixed",left:from.left+from.width/2-28+"px",top:from.top+from.height/2-28+"px",width:"56px",height:"56px",objectFit:"contain",borderRadius:"8px",padding:"4px",background:"white",boxShadow:"0 6px 22px rgba(10,25,50,.18)",pointerEvents:"none",zIndex:"9999"});
  document.body.append(fly);
  const dx=to.left+to.width/2-from.left-from.width/2, dy=to.top+to.height/2-from.top-from.height/2;
  const animation=fly.animate([{transform:"translate(0,0) scale(1)",opacity:1},{transform:`translate(${dx*.5}px,${dy*.52-35}px) scale(.85)`,opacity:.95,offset:.55},{transform:`translate(${dx}px,${dy}px) scale(.18)`,opacity:.15}],{duration:560,easing:"cubic-bezier(.25,.75,.3,1)"});
  animation.onfinish=()=>fly.remove(); animation.oncancel=()=>fly.remove();
}
