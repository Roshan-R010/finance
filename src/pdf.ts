/** Small, dependency-free text PDF for private operational reports. */
export function makePdf(lines: string[]): Buffer {
  const pages: string[][] = [];
  for (let i=0;i<lines.length;i+=46) pages.push(lines.slice(i,i+46));
  if(!pages.length)pages.push([]);
  const objects: string[] = [''];
  const add=(value:string)=>{objects.push(value);return objects.length-1;};
  const catalog=add(''),root=add(''),font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds:number[]=[];
  for(const page of pages){
    const escape=(s:string)=>s.normalize('NFKD').replace(/[^\x20-\x7E]/g,'?').replace(/[\\()]/g,'\\$&');
    const stream=['BT','/F1 11 Tf','50 790 Td','15 TL',...page.flatMap((line,i)=>i?[`T* (${escape(line)}) Tj`]:[`(${escape(line)}) Tj`]),'ET'].join('\n');
    const length=Buffer.byteLength(stream,'ascii');
    const content=add(`<< /Length ${length} >>\nstream\n${stream}\nendstream`);
    const pageId=add(`<< /Type /Page /Parent ${root} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[root]=`<< /Type /Pages /Kids [${pageIds.map(x=>`${x} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[catalog]=`<< /Type /Catalog /Pages ${root} 0 R >>`;
  let output='%PDF-1.4\n';const offsets=[0];
  for(let i=1;i<objects.length;i++){offsets[i]=Buffer.byteLength(output,'ascii');output+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(output,'ascii');output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++)output+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  output+=`trailer\n<< /Size ${objects.length} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output,'ascii');
}
