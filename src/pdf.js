// Firma hesap dökümü PDF'i (A4). jsPDF ve gömülü Liberation Sans fontlarıyla.
  var C={ink:[20,30,40],ink2:[85,98,111],line:[210,217,224],acc:[29,78,208],zeb:[243,245,248],amb:[138,101,0],white:[255,255,255]};
  function tl(n){return Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' TL'}
  export function buildPdf(jsPDF,fonts,d){
    var doc=new jsPDF({unit:'mm',format:'a4',compress:true});
    doc.addFileToVFS('LS-R.ttf',fonts.regular); doc.addFont('LS-R.ttf','LS','normal');
    doc.addFileToVFS('LS-B.ttf',fonts.bold); doc.addFont('LS-B.ttf','LS','bold');
    doc.setProperties({title:d.title,creator:'Atölye Panosu'});
    var W=210,H=297,M=14,CW=W-2*M,R=W-M,BOTTOM=H-20,LHF=1.22;
    function f(st,sz,col){doc.setFont('LS',st);doc.setFontSize(sz);var c=col||C.ink;doc.setTextColor(c[0],c[1],c[2])}
    function lh(sz){return sz*LHF*0.3528}
    function fill(c){doc.setFillColor(c[0],c[1],c[2])}
    function stroke(c,wd){doc.setDrawColor(c[0],c[1],c[2]);doc.setLineWidth(wd)}
    function txt(t,x,y,o){o=o||{};o.lineHeightFactor=LHF;doc.text(t,x,y,o)}
    var y=M+2;

    /* header: company left, document label right */
    f('bold',8,C.ink2); txt('HESAP DÖKÜMÜ',R,y+3,{align:'right'});
    f('normal',8,C.ink2); txt(d.generatedAt,R,y+7.5,{align:'right'}); txt('Hazırlayan: '+d.preparedBy,R,y+11.5,{align:'right'});
    var ly=y+5.5;
    if(d.company.name){f('bold',15);var cl=doc.splitTextToSize(d.company.name,118);txt(cl,M,ly);ly+=(cl.length-1)*lh(15)+5}
    if(d.company.info){f('normal',8.5,C.ink2);var il=doc.splitTextToSize(d.company.info,118);txt(il,M,ly);ly+=(il.length-1)*lh(8.5)+3}
    y=Math.max(ly,y+13)+2;
    stroke(C.acc,0.8); doc.line(M,y,R,y);
    y+=8;

    /* firm + period */
    f('normal',7.5,C.ink2); txt('FİRMA',M,y); txt('DÖNEM',R,y,{align:'right'});
    y+=5.8;
    f('normal',10); txt(d.period,R,y,{align:'right'}); var pw=doc.getTextWidth(d.period);
    f('bold',15); var fl=doc.splitTextToSize(d.firm.name,CW-pw-10); txt(fl,M,y); y+=(fl.length-1)*lh(15);
    var contact=[d.firm.contact?'Yetkili: '+d.firm.contact:'',d.firm.phone?'Tel: '+d.firm.phone:''].filter(Boolean).join('     ');
    if(contact){y+=5.4;f('normal',9,C.ink2);txt(contact,M,y)}
    y+=7;

    /* summary tiles */
    var t=d.totals;
    var tiles=[['İş sayısı',t.count+(t.pending?'  ('+t.pending+' bekliyor)':'')],['Ara toplam (KDV hariç)',tl(t.net)],['KDV %'+d.vatPct,tl(t.vat)],['Genel toplam',tl(t.gross)]];
    var gap=3,bw=(CW-gap*3)/4,bh=16;
    tiles.forEach(function(tile,i){
      var x=M+i*(bw+gap),hi=i===3;
      fill(hi?C.acc:C.zeb); doc.roundedRect(x,y,bw,bh,1.6,1.6,'F');
      f('normal',7,hi?C.white:C.ink2); txt(tile[0],x+3,y+5.2);
      var sz=10.5; f('bold',sz,hi?C.white:C.ink);
      while(doc.getTextWidth(tile[1])>bw-6&&sz>7){sz-=0.5;doc.setFontSize(sz)}
      txt(tile[1],x+3,y+12);
    });
    y+=bh+8;

    /* table */
    var cols=[{k:'date',t:'Tarih',w:19},{k:'title',t:'Yapılan iş',w:64},{k:'type',t:'Tür',w:24},{k:'size',t:'Ölçü / adet',w:33},{k:'m2',t:'m²',w:13,al:'right'},{k:'amt',t:'Tutar (KDV hariç)',w:29,al:'right'}];
    function head(){
      f('bold',8,C.white);
      var lines=cols.map(function(c){return doc.splitTextToSize(c.t,c.w-4)});
      var hh=Math.max.apply(null,lines.map(function(l){return l.length}))*lh(8)+4.2;
      fill(C.ink); doc.rect(M,y,CW,hh,'F');
      var x=M;
      cols.forEach(function(c,i){txt(lines[i],c.al==='right'?x+c.w-2:x+2,y+4.4,{align:c.al||'left'});x+=c.w});
      y+=hh;
    }
    head();
    if(!d.rows.length){f('normal',9,C.ink2);txt('Bu dönemde iş girişi yok.',M+2,y+6);y+=10}
    d.rows.forEach(function(r,idx){
      f('normal',9);
      var cell={date:[r.date],title:doc.splitTextToSize(r.title||'',cols[1].w-4),type:doc.splitTextToSize(r.type||'—',cols[2].w-4),
        size:doc.splitTextToSize(r.size||'—',cols[3].w-4),m2:[r.m2||'—']};
      f('bold',8.5); var amt=r.amount==null?['Fiyat bekliyor']:[tl(r.amount)];
      if(doc.getTextWidth(amt[0])>cols[5].w-4) amt=doc.splitTextToSize(amt[0],cols[5].w-4);
      f('normal',7.5); var sub=r.sub?doc.splitTextToSize(r.sub,cols[1].w-4):[];
      var titleExtra=(cell.title.length-1)*lh(9)+(sub.length?sub.length*lh(7.5)+0.4:0);
      var other=Math.max((cell.type.length-1)*lh(9),(cell.size.length-1)*lh(9),(amt.length-1)*lh(9));
      var rh=5+Math.max(titleExtra,other)+2.6;
      if(y+rh>BOTTOM){doc.addPage();y=M;head()}
      if(idx%2===1){fill(C.zeb);doc.rect(M,y,CW,rh,'F')}
      var x=M,ty=y+5;
      cols.forEach(function(c){
        var tx=c.al==='right'?x+c.w-2:x+2;
        if(c.k==='title'){
          f('normal',9,C.ink); txt(cell.title,tx,ty);
          if(sub.length){f('normal',7.5,C.ink2);txt(sub,tx,ty+(cell.title.length-1)*lh(9)+lh(7.5)+0.4)}
        }else if(c.k==='amt'){
          if(r.amount==null) f('bold',8.5,C.amb); else f('bold',9,C.ink);
          txt(amt,tx,ty,{align:'right'});
        }else{
          f('normal',c.k==='date'?8.5:9,c.k==='date'?C.ink2:C.ink); txt(cell[c.k],tx,ty,{align:c.al||'left'});
        }
        x+=c.w;
      });
      y+=rh; stroke(C.line,0.2); doc.line(M,y,R,y);
    });

    /* totals */
    y+=7;
    if(y+34>BOTTOM){doc.addPage();y=M+4}
    var lx=R-78;
    [['Ara toplam (KDV hariç)',tl(t.net)],['KDV (%'+d.vatPct+')',tl(t.vat)]].forEach(function(p){
      f('normal',9.5,C.ink2);txt(p[0],lx,y);f('normal',9.5,C.ink);txt(p[1],R,y,{align:'right'});y+=6;
    });
    stroke(C.ink,0.4); doc.line(lx,y-2.6,R,y-2.6); y+=3.4;
    f('bold',12,C.ink); txt('Genel toplam',lx,y); txt(tl(t.gross),R,y,{align:'right'});
    y+=9;
    if(t.pending){f('normal',8.5,C.amb);var pl=doc.splitTextToSize(t.pending+' iş henüz fiyatlandırılmadı; bu işler toplamlara dahil değildir.',CW);txt(pl,M,y);y+=pl.length*lh(8.5)+2}
    f('normal',8,C.ink2); txt(doc.splitTextToSize('Tutarlar KDV hariç gösterilmiştir. KDV dahil girilen fiyatlar %'+d.vatPct+' KDV düşülerek hesaplanmıştır.',CW),M,y);

    /* footer on every page */
    var n=doc.getNumberOfPages(), foot=[d.company.name,d.firm.name+' hesap dökümü',d.period].filter(Boolean).join(' · ');
    for(var i=1;i<=n;i++){
      doc.setPage(i); stroke(C.line,0.2); doc.line(M,H-13,R,H-13);
      f('normal',7.5,C.ink2); txt(doc.splitTextToSize(foot,CW-30)[0],M,H-8.5); txt('Sayfa '+i+' / '+n,R,H-8.5,{align:'right'});
    }
    return doc.output('arraybuffer');
  }
