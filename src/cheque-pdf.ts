type DepositRow={scheduled_date?:string|null;borrower_name?:string|null;borrower_person_name?:string|null;organization_name?:string|null;borrower_phone?:string|null;amount_paise:number};
type DepositReport={date:string;endDate?:string;rows:DepositRow[];count:number;amount:number};
export const formatInr=(paise:number)=>{const value=BigInt(paise);return 'INR '+(value/100n).toLocaleString('en-IN')+'.'+String(value%100n).padStart(2,'0');};
const safe=(value:string)=>value.normalize('NFKD').replace(/[^\x20-\x7E]/g,'?').replace(/[\\()]/g,'\\$&');
const shortDate=(value:string)=>{const [year,month,day]=value.split('-');return `${Number(day)} ${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(month)-1]} ${year.slice(-2)}`;};
export function chequeDepositPdf(report:DepositReport):Buffer{
  const pages:string[][]=[],add=(page:string[],font:'F1'|'F2',size:number,x:number,y:number,value:string)=>{
    page.push('BT',`/${font} ${size} Tf`,`${x} ${y} Td`,`(${safe(value)}) Tj`,'ET');
  };
  const startPage=(pageNo:number)=>{
    const commands:string[]=['0.10 0.13 0.11 rg'];
    add(commands,'F2',19,42,790,'Cheques to Deposit');
    add(commands,'F1',10,42,768,`Scheduled dates: ${report.date}${report.endDate&&report.endDate!==report.date?' to '+report.endDate:''}`);
    add(commands,'F1',10,42,752,`${report.count} scheduled cheque${report.count===1?'':'s'}  |  Deposit status not recorded`);
    commands.push('0.92 0.93 0.91 rg','42 709 511 27 re f','0.10 0.13 0.11 rg');
    add(commands,'F2',10,50,718,'Borrower / Organisation');
    add(commands,'F2',10,300,718,'Phone Number');
    add(commands,'F2',10,424,718,'Cheque Amount');
    add(commands,'F1',9,42,36,`Page ${pageNo}`);
    pages.push(commands);
    return commands;
  };
  let page=startPage(1),y=689;
  if(!report.rows.length)add(page,'F1',11,50,y,'No pending cheques for these dates.');
  const groups=new Map<string,DepositRow[]>();
  for(const row of report.rows){const date=row.scheduled_date||report.date;if(!groups.has(date))groups.set(date,[]);groups.get(date)!.push(row);}
  const dateHeading=(date:string,rows:DepositRow[],continued=false)=>{
    page.push('0.93 0.96 0.99 rg',`42 ${y-10} 511 27 re f`,'0.10 0.13 0.11 rg');
    add(page,'F2',10,50,y,`${shortDate(date)}${continued?' (continued)':`  |  ${rows.length} cheque${rows.length===1?'':'s'}`}`);
    if(!continued)add(page,'F2',10,424,y,formatInr(rows.reduce((total,row)=>total+row.amount_paise,0)));
    y-=34;
  };
  for(const [date,rows] of [...groups.entries()].sort(([a],[b])=>a.localeCompare(b))){
    if(y<135){page=startPage(pages.length+1);y=689;}
    dateHeading(date,rows);
    for(const row of rows){
      if(y<100){page=startPage(pages.length+1);y=689;dateHeading(date,rows,true);}
      const displayName=row.borrower_name||row.organization_name||row.borrower_person_name||'Borrower';
      add(page,'F2',10,50,y,String(displayName).slice(0,32));
      add(page,'F1',10,300,y,String(row.borrower_phone||'-').slice(0,20));
      add(page,'F1',10,424,y,formatInr(row.amount_paise));
      page.push('0.86 0.88 0.85 RG',`42 ${y-8} m 553 ${y-8} l S`,'0.10 0.13 0.11 rg');
      y-=26;
    }
  }
  if(y<85){page=startPage(pages.length+1);y=689;}
  page.push('0.93 0.94 0.91 rg',`42 ${y-20} 511 33 re f`,'0.10 0.13 0.11 rg');
  add(page,'F2',11,50,y-8,'Grand total');
  add(page,'F2',11,424,y-8,formatInr(report.amount));
  const objects:string[]=[''],addObject=(value:string)=>{objects.push(value);return objects.length-1;};
  const catalog=addObject(''),root=addObject('');
  const regular=addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const bold=addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds:number[]=[];
  for(const commands of pages){
    const stream=commands.join('\n'),content=addObject(`<< /Length ${Buffer.byteLength(stream,'ascii')} >>\nstream\n${stream}\nendstream`);
    pageIds.push(addObject(`<< /Type /Page /Parent ${root} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[root]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[catalog]=`<< /Type /Catalog /Pages ${root} 0 R >>`;
  let output='%PDF-1.4\n';const offsets=[0];
  for(let i=1;i<objects.length;i++){offsets[i]=Buffer.byteLength(output,'ascii');output+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(output,'ascii');output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++)output+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  output+=`trailer\n<< /Size ${objects.length} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output,'ascii');
}
