// No database writes here. Always settle active uploads before the caller can
// clean orphan media or release its save lock after failure.
export async function prepareAtomicOrderUploads(images,uploadImage,concurrency=2) {
  const uploaded=[];let next=0,failed=false,error;
  const worker=async()=>{
    while(!failed&&next<images.length){
      const image=images[next++];if(image.mediaId||!image.file)continue;
      try {const mediaId=await uploadImage(image.file,image.kind);image.mediaId=mediaId;uploaded.push({key:image.key,mediaId});}
      catch(reason){if(!failed){failed=true;error=reason;}}
    }
  };
  await Promise.all(Array.from({length:concurrency===1?1:2},worker));
  return {uploaded,failed,error};
}
