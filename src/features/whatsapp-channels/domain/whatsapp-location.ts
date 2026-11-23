/** The webhook persists WhatsApp positions in body_text without media downloads. */
export type WhatsAppLocation = {
  latitude: number;
  longitude: number;
  name: string;
  address: string;
  mapsUrl: string;
};
export function parseWhatsAppLocation(body:string|null|undefined):WhatsAppLocation|null {
  const parts=String(body||"").split("\n");
  const match=/^geo:(-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)),(-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))$/.exec(parts[0]?.trim()||"");
  if(!match)return null;
  const latitude=Number(match[1]),longitude=Number(match[2]);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||
    Math.abs(latitude)>90||Math.abs(longitude)>180)return null;
  return {
    latitude,longitude,
    name:(parts[1]||"").trim().slice(0,140),
    address:parts.slice(2).join(" ").trim().slice(0,240),
    mapsUrl:"https://www.google.com/maps/search/?api=1&query="+
      encodeURIComponent(latitude+","+longitude),
  };
}
