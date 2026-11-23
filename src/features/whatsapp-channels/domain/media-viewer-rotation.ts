/** Geometria independente do DOM para zoom e rotação no visualizador de mídia. */
export function normalizeMediaRotation(degrees:number):number {
  return ((degrees%360)+360)%360;
}
export function mediaViewerFitScale(
  imageWidth:number,imageHeight:number,viewportWidth:number,viewportHeight:number,rotation:number,
):number {
  if([imageWidth,imageHeight,viewportWidth,viewportHeight].some(value=>!Number.isFinite(value)||value<=0))return 1;
  const sideways=normalizeMediaRotation(rotation)%180!==0;
  const visibleWidth=sideways?imageHeight:imageWidth;
  const visibleHeight=sideways?imageWidth:imageHeight;
  return Math.min(1,viewportWidth/visibleWidth,viewportHeight/visibleHeight);
}
export function mediaViewerPanBounds(input:{
  imageWidth:number;imageHeight:number;viewportWidth:number;viewportHeight:number;
  zoom:number;fitScale:number;rotation:number;
}):{maxX:number;maxY:number} {
  const {imageWidth,imageHeight,viewportWidth,viewportHeight,zoom,fitScale,rotation}=input;
  if([imageWidth,imageHeight,viewportWidth,viewportHeight,zoom,fitScale].some(value=>!Number.isFinite(value)||value<=0)){
    return {maxX:0,maxY:0};
  }
  const sideways=normalizeMediaRotation(rotation)%180!==0;
  const width=(sideways?imageHeight:imageWidth)*zoom*fitScale;
  const height=(sideways?imageWidth:imageHeight)*zoom*fitScale;
  return {
    maxX:Math.max(0,(width-viewportWidth)/2),
    maxY:Math.max(0,(height-viewportHeight)/2),
  };
}
