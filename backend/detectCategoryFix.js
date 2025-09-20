const currentExt = path.extname(inputPath).slice(1).toLowerCase();
let mimeType   = mime.lookup(currentExt) || "";
let category   = detectCategory(mimeType);

// fallback: если mime пустой, смотрим по расширению
if (category === "unknown") {
  if (["mp4","avi","webm"].includes(currentExt)) category = "video";
  if (["mp3","wav","ogg","flac"].includes(currentExt)) category = "audio";
  if (["png","jpg","jpeg","bmp","gif","webp"].includes(currentExt)) category = "image";
  if (["pdf","docx","txt"].includes(currentExt)) category = "document";
}
