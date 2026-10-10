import { DRINKS } from './cycle.mjs';
import { MachineSession } from './session.mjs';
import { getBrewMechanics } from './brew-mechanics.mjs';

const $ = id => document.getElementById(id);
const cycle = new MachineSession('latte');
let scene, currentView = 'overview', cutaway = true, labels = true, exploded = false;
let selectedComponent = null, last = performance.now(), uiClock = 0;
let mechanicStop = null;
const theme = matchMedia('(prefers-color-scheme: dark)');
const formatTime = t => `${String(Math.floor(t / 60)).padStart(2,'0')}:${String(Math.floor(t % 60)).padStart(2,'0')}`;
const components = {
  hopper: { label:'Bohnenbehälter', title:'Die Bohnen rutschen nach.', text:'Während des Mahlens rüttelt der Behälter leicht. Die Bohnen setzen sich und rutschen zum Mahlwerk nach. Der Demo-Vorrat von 60 g nimmt bei jedem Bezug um 9 g ab; erst „Zurücksetzen“ füllt ihn wieder. Die Bewegung ist zur Erklärung vergrößert.', view:'overview' },
  grinder: { label:'Keramikmahlwerk', title:'Ein eigenes Mahlwerk.', text:'Ein eigener Motor dreht die Mahlscheiben. Das Kaffeemehl fällt durch einen Schacht in die offene Brühkammer. Das Mahlwerk bleibt im Gerät, wenn die Brühgruppe herausgenommen wird.', view:'brew' },
  brew: { label:'Brühgruppe', title:'Aufnehmen. Verdichten. Brühen.', text:'Die herausnehmbare Mechanik nimmt das Kaffeemehl auf, bewegt die Kammer gegen den Brühkolben und dichtet sie ab. Heißes Wasser durchströmt den Kaffee. Anschließend wird der gebrauchte Puck ausgeworfen. Motor und Heizung sitzen separat im Gehäuse.', view:'brew' },
  drive: { label:'Motor & Kupplung', title:'Die Kraft kommt von außen.', text:'Der Motor links neben der Brühgruppe bewegt über Schnecke und Zahnräder die Antriebsachse. Die Gruppe greift in seine Kupplung. „Brühgruppe heraus“ zieht zuerst den rechten Wassertank vor und nimmt dann die Gruppe nach rechts aus dem Gerät.', view:'brew' },
  heater: { label:'Heizung', title:'Heißwasser oder Dampf.', text:'Ein elektrischer Durchlauferhitzer erhitzt das gepumpte Wasser außerhalb der Brühgruppe. Zum Kaffeebrühen bleibt das Wasser unter dem Siedepunkt. Für das Milchsystem wird Dampf erzeugt und über einen eigenen Weg zu LatteGo geleitet.', view:'water' },
  tank: { label:'Wassertank', title:'Frischwasser auf der rechten Seite.', text:'Von vorne gesehen sitzt der abnehmbare Tank rechts. Die Pumpe fördert sein kaltes Wasser zur Heizung. Für die Serviceansicht wird der Tank zuerst nach vorne gezogen; danach kann die Brühgruppe rechts heraus. Blau zeigt die Zufuhr, Orange das heiße Wasser.', view:'water' },
  pump: { label:'Pumpe', title:'Die Pumpe sorgt für Druck.', text:'Die Pumpe fördert Wasser aus dem Tank zur Heizung und weiter zur Brühgruppe oder zum Dampfweg. Der tatsächliche Brühdruck hängt auch vom Widerstand des Kaffeepucks ab. Die Modellanzeige ist kein Messwert dieses Geräts.', view:'water' },
  milk: { label:'LatteGo', title:'Dampf nimmt Milch und Luft mit.', text:'Der Dampfstrom saugt Milch aus dem Behälter durch den Kanal zwischen seinen beiden Teilen an. Luft wird beigemischt; kleine Blasen bilden Schaum. Die erwärmte Milch läuft durch einen eigenen Auslass in die Tasse.', view:'milk' },
  waste: { label:'Tresterbehälter', title:'Der Puck fällt nach unten.', text:'Nach dem Brühen wird der Druck abgebaut. Die Mechanik öffnet, hebt den feuchten Kaffeepuck aus der Kammer und streift ihn in den Tresterbehälter. Restwasser geht getrennt davon in die Tropfschale.', view:'brew' },
  lowerSieve: {label:'Unteres Sieb / Kolben',title:'Die Bodenfläche wird zum Auswerfer.',text:'Beim Brühen trägt das untere Sieb den verdichteten Kaffee. Nach dem Öffnen hebt sein Kolben den ganzen Puck bis über den Becherrand. Die freie Fläche liegt dann direkt unter dem Abstreifbügel.',view:'brew'},
  linkage: {label:'Kurbel & Gelenke',title:'Drehung wird zur Kammerbewegung.',text:'Motor, Schnecke und Getriebe bleiben im Gehäuse. Die Kupplung dreht die Kurbel der Brühgruppe. Gelenkhebel übertragen die Kraft auf den geführten Kammerträger. Das dargestellte Gestänge ist zur Erklärung vereinfacht.',view:'brew'},
};
const insights = {
  grind:['BOHNE → KAFFEEMEHL','Rütteln lässt Bohnen nachrutschen.','Der Bohnenbehälter vibriert beim Mahlen leicht. Die Bohnen rutschen zum Einlauf nach, der Vorrat sinkt. Das separate Mahlwerk zerkleinert sie; frisches Kaffeemehl fällt in die offene Brühkammer.'],
  compress:['DER ANTRIEB','Ein Motor außerhalb der Brühgruppe.','Die Kupplung überträgt die Bewegung vom Gehäuse in die Brühgruppe. Ihre Mechanik bringt den Kaffee an den Brühkolben und verdichtet ihn.'],
  heat:['WÄRME ERZEUGEN','Die Heizung sitzt separat.','Die Heizung erwärmt das Wasser im Gerät. Die herausnehmbare Brühgruppe bekommt das heiße Wasser erst später über ihren Anschluss.'],
  milk:['MILCH ZUERST','Ein eigener Weg in die Tasse.','Der Dampfstrom saugt Milch durch den LatteGo-Kanal an. Beigemischte Luft macht den Schaum. Dabei fließt noch kein Kaffee in die Tasse.'],
  condition:['VOM DAMPF ZUM KAFFEE','Jetzt zählt die Brühtemperatur.','Für Kaffee wird auf eine niedrigere Temperatur umgestellt. Das Wasser zum Brühen soll heiß sein, aber nicht kochen. Philips nennt dafür 90–98 °C.'],
  prewet:['DIE VORBRÜHUNG','Erst einmal befeuchten.','Ein kurzer Wasserstoß benetzt den verdichteten Kaffee. Das Kaffeemehl nimmt Wasser auf, bevor die eigentliche Extraktion beginnt.'],
  bloom:['DIE KURZE PAUSE','Der Kaffee darf quellen.','Die Pumpe hält kurz an. Der bereits feuchte Kaffee quillt. Die Brühkammer bleibt geschlossen; in diesem vereinfachten Ablauf fließt noch kein Kaffee in die Tasse.'],
  extract:['DIE EXTRAKTION','Druck bringt Aroma in die Tasse.','Heißes Wasser strömt von unten durch den feuchten Kaffeepuck nach oben. Es löst Aromastoffe. Durch das obere Sieb und den Kaffeeauslauf gelangt der Kaffee in die Tasse.'],
  depressurize:['VOR DEM ÖFFNEN','Erst den Druck abbauen.','Die Pumpe stoppt. Der Druck im Brühraum wird abgebaut und Restwasser in die Tropfschale abgeleitet. Erst danach öffnet die Mechanik.'],
  eject:['DER TRESTER','Was übrig bleibt, fällt heraus.','Der verbrauchte Kaffee ist zu einem feuchten Puck gepresst. Die Mechanik hebt ihn heraus und streift ihn in den separaten Tresterbehälter.'],
  return:['DIE RUHEPOSITION','Bereit für die nächste Bohne.','Der Motor fährt die leere Brühkammer unter den Mahlwerkschacht zurück. In der Tasse bleibt das Getränk, unten der gebrauchte Kaffeepuck.'],
  complete:['DER KREIS SCHLIESST SICH','Dein Kaffee ist fertig.','„Noch einen Kaffee“ verwendet die verbleibenden Bohnen und das Restwasser. Die Kaffeepucks sammeln sich unten. Erst „Zurücksetzen“ füllt beide Vorräte und leert den Tresterbehälter.'],
};
let chapters = [];
function buildChapters() {
  const p = id => cycle.phases.find(x => x.id === id)?.start;
  const milk = cycle.drink !== 'espresso';
  chapters = [
    {title:'Mahlen',caption:'Bohne → Pulver',start:p('grind')},
    {title:'Verdichten',caption:'Kammer schließen',start:p('compress')},
    {title:milk?'Milchschaum':'Erhitzen',caption:milk?'Dampf & Luft':'Wasser erwärmen',start:p('heat')},
    {title:'Vorbrühen',caption:'Benetzen & warten',start:p('prewet')},
    {title:'Brühen',caption:'Aroma lösen',start:p('extract')},
    {title:'Auswerfen',caption:'Puck abstreifen',start:p('depressurize')},
  ];
  $('phase-list').replaceChildren();
  chapters.forEach((chapter,i) => {
    const b=document.createElement('button'); b.className='phase-step';
    b.innerHTML=`<span class="step-index">${String(i+1).padStart(2,'0')}</span><span>${chapter.title}<small>${chapter.caption}</small></span>`;
    b.setAttribute('aria-label',`Zu Schritt ${i+1}: ${chapter.title}`);
    b.addEventListener('click',()=>{mechanicStop=null;insertGroup();cycle.seek(chapter.start+.01);draw();});
    $('phase-list').append(b);
  });
  $('timeline').max=cycle.duration; $('total').textContent=formatTime(cycle.duration);
}

const leaderSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');leaderSvg.classList.add('annotation-leaders');leaderSvg.setAttribute('aria-hidden','true');$('annotations').append(leaderSvg);
const leaders={};
Object.entries(components).forEach(([id,c])=>{
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');leaderSvg.append(line);leaders[id]=line;
  const b=document.createElement('button');b.className='annotation';b.id=`label-${id}`;b.textContent=c.label;
  b.setAttribute('aria-label',`${c.label} erklären`);b.addEventListener('click',()=>focusComponent(id));$('annotations').append(b);
});
function setView(name) {
  currentView=name;document.querySelector('.stage').dataset.view=name;scene?.setView(name);
  $('mechanics-detail').hidden=name!=='brew';
  if(name!=='overview')setCutaway(true);
  document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
}
function setCutaway(value){cutaway=value;scene?.setCutaway(value);$('cutaway').classList.toggle('active',value);$('cutaway').setAttribute('aria-pressed',value);}
function setExploded(value){
  exploded=value;
  if(value){mechanicStop=null;cycle.pause();setCutaway(true);setView('brew');focusComponent('drive',false);}
  scene?.setExploded(value);$('explode').classList.toggle('active',value);$('explode').setAttribute('aria-pressed',value);
  $('explode').querySelector('span').textContent=value?'Brühgruppe einsetzen':'Brühgruppe heraus';
  $('view-note').textContent=value?'Serviceansicht · Tank vor, Brühgruppe nach rechts':'Frei drehbares Schnittmodell';
}
function insertGroup(){if(exploded)setExploded(false);}
function focusComponent(id,move=true){selectedComponent=id;const c=components[id];$('component-title').textContent=c.title;$('component-text').textContent=c.text;$('component-info').hidden=false;if(move)setView(c.view);}
function togglePlay(){if(!scene||cycle.state.resourceEmpty)return;mechanicStop=null;insertGroup();if(cycle.playing)cycle.pause();else{setCutaway(true);cycle.play();}draw();}
function reset(){mechanicStop=null;cycle.reset();insertGroup();draw();}
function demonstrateMechanism(part){
  if(!scene||cycle.state.resourceEmpty)return;
  insertGroup();cycle.pause();setView('brew');
  const closing=cycle.phases.find(p=>p.id==='compress'),eject=cycle.phases.find(p=>p.id==='eject');
  const clips={travel:[closing.start,closing.start+closing.duration*.45],compress:[closing.start+closing.duration*.45,closing.end],lift:[eject.start,eject.start+eject.duration*.43],wipe:[eject.start+eject.duration*.43,eject.end]};
  const [start,end]=clips[part];cycle.seek(start+.001);mechanicStop=end;cycle.speed=.5;$('speed').value='0.5';cycle.play();draw();
}
function updateUI(){
  const s=cycle.state, ready=s.time===0&&!cycle.playing&&!s.resourceEmpty;
  const emptyLabel=s.waterEmpty?'Wassertank leer':'Bohnenbehälter leer';
  const hasMilk=DRINKS[cycle.drink].hasMilk;
  const index=Math.max(0,chapters.findLastIndex(c=>s.time>=c.start));
  $('phase-number').textContent=ready?'BEREIT FÜR DEN ERSTEN KAFFEE':s.complete?'DER KAFFEE IST FERTIG':`SCHRITT ${String(index+1).padStart(2,'0')} / 06`;
  $('phase-title').textContent=ready?'Was steckt in deiner Tasse?':s.phase.title;
  $('phase-description').textContent=ready?'Starte den Automaten. Sieh zu, wie Mahlwerk, Brühgruppe und Milchsystem zusammenarbeiten.':s.phase.description;
  $('temperature').innerHTML=`${Math.round(s.heaterTemp)}<small> °C</small>`;
  $('pressure').innerHTML=`${s.pressure.toFixed(1).replace('.',',')}<small> bar</small>`;
  $('temperature-meter').style.width=`${Math.max(0,Math.min(100,(s.heaterTemp-20)/110*100))}%`;
  $('pressure-meter').style.width=`${Math.max(0,Math.min(100,s.pressure/9*100))}%`;
  $('milk-value').textContent=`${Math.round((s.milkMl||0)+(s.foamMl||0))} ml`;
  $('coffee-value').textContent=`${Math.round(s.coffeeMl||0)} ml`;
  $('tank-volume').textContent=`${Math.ceil(s.tankRemainingMl)} / ${s.tankCapacityMl} ml`;
  $('tank-fill').style.width=`${s.tankLevel*100}%`;
  $('tank-gauge').setAttribute('aria-valuemax',s.tankCapacityMl);
  $('tank-gauge').setAttribute('aria-valuenow',Math.round(s.tankRemainingMl));
  $('bean-volume').textContent=`${s.beansRemainingG.toFixed(1).replace('.',',')} / ${s.beanCapacityG} g`;
  $('bean-fill').style.width=`${s.beanLevel*100}%`;
  $('bean-gauge').setAttribute('aria-valuemax',s.beanCapacityG);
  $('bean-gauge').setAttribute('aria-valuenow',s.beansRemainingG.toFixed(1));
  $('puck-value').textContent=`${s.storedPucks} ${s.storedPucks===1?'Puck':'Pucks'}`;
  $('water-alert').hidden=!s.resourceEmpty;
  $('empty-reason').textContent=`${emptyLabel}.`;
  $('reset').classList.toggle('reset-attention',s.resourceEmpty);
  $('play').disabled=!scene||s.resourceEmpty;$('timeline').disabled=s.resourceEmpty;
  document.querySelectorAll('[data-mechanism],[data-drink],#phase-list button').forEach(b=>{b.disabled=s.resourceEmpty;});
  const [kicker,title,explanation]=ready?(hasMilk?['DAS ZUSAMMENSPIEL','Drei Wege. Eine Tasse.','Das Mahlwerk liefert Kaffeemehl. Pumpe und Heizung liefern heißes Wasser. Das Milchsystem macht den Schaum. Erst in der Tasse kommt alles zusammen.']:['DER ESPRESSO','Bohnen, Wasser und Druck.','Das Mahlwerk liefert frischen Kaffee. Die Brühgruppe verdichtet ihn, die Pumpe drückt heißes Wasser hindurch. Das Milchsystem bleibt bei diesem Getränk aus.']):(insights[s.phase.id]||insights.complete);
  $('insight-kicker').textContent=kicker;$('insight-title').textContent=title;$('insight-text').textContent=explanation;
  const mechanics=getBrewMechanics(s);$('mechanics-status').textContent=mechanics.label;
  $('mechanics-detail').classList.toggle('demonstrating',mechanicStop!==null);
  if(s.phase.id==='eject'){
    const details={open:['Die Kammer öffnet.','Der Außenantrieb senkt die Kammer vom festen oberen Kolben ab. Der zusammengepresste Puck bleibt zunächst auf dem unteren Sieb.'],present:['Zurück vor den Kolben.','Das Gestänge fährt den Becher nach vorne in die Auswurfstellung. Der untere Kolben hat den Puck noch nicht angehoben.'],'lift-puck':['Das untere Sieb hebt an.','Der Boden des Bechers fährt nach oben und hebt den Puck über den Rand. Der Drahtbügel wartet noch außerhalb des Bechers.'],approach:['Jetzt kommt der Drahtbügel.','Der Puck liegt frei auf dem angehobenen Sieb. Der Drahtbügel fährt an seine Vorderkante.'],sweep:['Der Draht streift den Puck ab.','Der Querbügel schiebt den Puck seitlich vom angehobenen Sieb. Erst wenn der Puck vollständig über den Becherrand gelangt ist, fällt er nach unten.'],fall:['Der Puck fällt in den Behälter.','Nach dem Abstreifen fällt der Puck durch die freie Öffnung in den Tresterbehälter. Das untere Sieb bleibt zunächst angehoben.'],reset:['Der Bügel fährt zurück.','Der Puck ist im Tresterbehälter. Das untere Sieb senkt sich; anschließend kehrt der Drahtbügel in seine Parkposition zurück.']};
    const detail=details[mechanics.stage];if(detail){$('insight-title').textContent=detail[0];$('insight-text').textContent=detail[1];}
  }
  let flow=ready?(hasMilk?'Bohnen, Wasser und Milch sind bereit.':'Bohnen und Wasser sind bereit.'):s.complete?'Ausgabe beendet · Brühgruppe in Ruheposition':s.grind?'Mahlwerk → offene Brühkammer':s.milkFlow?'Tank → Heizung → LatteGo → Tasse':s.brewFlow?'Heizung → Kaffeepuck → Kaffeeauslauf':s.phase.id==='extract'?'Druckaufbau · Kaffee füllt den Auslauf':s.preinfusion?'Heißwasser benetzt den Kaffeepuck':s.phase.id==='bloom'?'Pumpe steht · Kaffee quillt':s.draining?'Restwasser → Tropfschale':s.phase.id==='heat'?'Heizung erreicht die Arbeitstemperatur':s.phase.id==='condition'?'Umstellen auf Brühtemperatur':s.phase.id==='eject'?'Brühkammer → Tresterbehälter':'Antrieb bewegt die Brühgruppe';
  if(s.resourceEmpty)flow=`${emptyLabel} · Maschine angehalten`;
  else if(exploded)flow='Serviceansicht · Tank vorgezogen, Brühgruppe rechts';
  else if(!cycle.playing&&!ready&&!s.complete)flow=`Pause · ${flow}`;
  $('flow-text').textContent=flow;$('status-dot').classList.toggle('running',cycle.playing);
  $('play-icon').textContent=cycle.playing?'Ⅱ':s.complete?'↻':'▶';
  $('play-text').textContent=s.resourceEmpty?emptyLabel:cycle.playing?'Pause':s.complete?'Noch einen Kaffee':s.time>0?'Weiter zubereiten':'Kaffee zubereiten';
  $('play').setAttribute('aria-label',s.resourceEmpty?`${emptyLabel} – bitte zurücksetzen`:cycle.playing?'Zubereitung pausieren':s.complete?'Neue Zubereitung starten':'Zubereitung starten oder fortsetzen');
  $('elapsed').textContent=formatTime(s.time);$('timeline').value=s.time;$('timeline').style.setProperty('--progress',`${s.progress*100}%`);
  $('timeline').setAttribute('aria-valuetext',`${s.phase.title}, ${formatTime(s.time)} von ${formatTime(cycle.duration)}`);
  $('timeline-status').textContent=s.resourceEmpty?`${emptyLabel.toUpperCase()} · ANGEHALTEN`:ready?'BEREIT':`${s.phase.title.toUpperCase()}${!cycle.playing&&!s.complete?' · PAUSIERT':''}`;
  $('timeline-percent').textContent=`${Math.round(s.progress*100)} %`;
  if(s.resourceEmpty){
    $('phase-number').textContent=s.waterEmpty?'WASSER AUFGEBRAUCHT':'BOHNEN AUFGEBRAUCHT';$('phase-title').textContent=`${emptyLabel}.`;
    $('phase-description').textContent='Die Maschine hält an. „Zurücksetzen“ füllt Wasser und Bohnen auf und leert den Tresterbehälter.';
    $('insight-kicker').textContent='BIS ZUM ZURÜCKSETZEN';$('insight-title').textContent='Der bisherige Stand bleibt erhalten.';
    $('insight-text').textContent='Die bereits gesammelten Pucks bleiben im Behälter. Das angefangene Getränk bleibt in der Tasse; die Mechanik und alle Flüssigkeitsströme stehen still.';
  }
  const announcement=s.resourceEmpty?`${emptyLabel}. Bitte zurücksetzen.`:ready?'Bereit':s.phase.title;
  if($('phase-announcement').textContent!==announcement)$('phase-announcement').textContent=announcement;
  [...$('phase-list').children].forEach((b,i)=>{b.classList.toggle('active',index===i);if(index===i)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
}
const labelsByView={overview:['hopper','grinder','brew','milk','tank'],brew:['drive','lowerSieve','linkage'],milk:['milk','heater'],water:['tank','pump','heater','brew']};
function updateAnnotations(){
  if(!scene)return;
  const anchors=scene.getAnnotations(), canvas=$('scene'),w=canvas.clientWidth,h=canvas.clientHeight,placed=[];
  const offsets={hopper:[0,-24],grinder:[-55,-12],brew:[65,0],drive:[-85,-40],tank:[65,-20],heater:[-60,15],milk:[-30,20],waste:[60,25],pump:[-55,15],lowerSieve:[65,45],linkage:[-85,35]};
  for(const [id,c] of Object.entries(components)){
    const b=$(`label-${id}`),a=anchors[id];
    leaders[id].style.display='none';
    const relevant=labelsByView[currentView].includes(id)||(currentView==='brew'&&exploded&&id==='tank');
    if(!labels||!cutaway||!a||a.visible===false||!relevant){b.hidden=true;continue;}
    b.hidden=false;b.classList.toggle('active',selectedComponent===id);
    const bw=b.offsetWidth,bh=b.offsetHeight,off=offsets[id];
    let x=Math.max(bw/2+10,Math.min(w-bw/2-10,a.x+off[0])),y=Math.max(15,Math.min(h-105,a.y+off[1]));
    // Keep the title and view controls readable, and separate nearby labels.
    if(x-bw/2<235&&y<210)y=215;
    if(w>480&&x-bw/2<190&&y>210&&y<355)x=Math.min(w-bw/2-10,200+bw/2);
    for(let tries=0;tries<6&&placed.some(p=>Math.abs(p.x-x)<(p.w+bw)/2+8&&Math.abs(p.y-y)<bh+6);tries++)y+=bh+7;
    if(y>h-(w<=480?155:105)){b.hidden=true;continue;}
    b.style.left=`${x}px`;b.style.top=`${y}px`;placed.push({x,y,w:bw});
    const line=leaders[id];line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',x);line.setAttribute('y2',y);line.style.display='';
  }
}
function draw(){updateUI();scene?.update(cycle.state,0);updateAnnotations();}
$('play').addEventListener('click',togglePlay);$('reset').addEventListener('click',reset);
$('speed').addEventListener('change',e=>{cycle.speed=Number(e.target.value);});
$('timeline').addEventListener('input',e=>{mechanicStop=null;insertGroup();cycle.seek(Number(e.target.value));draw();});
$('cutaway').addEventListener('click',()=>{setCutaway(!cutaway);draw();});
$('labels').addEventListener('click',()=>{labels=!labels;$('labels').classList.toggle('active',labels);$('labels').setAttribute('aria-pressed',labels);updateAnnotations();});
$('explode').addEventListener('click',()=>{setExploded(!exploded);draw();});
$('close-component').addEventListener('click',()=>{selectedComponent=null;$('component-info').hidden=true;});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelectorAll('[data-mechanism]').forEach(b=>b.addEventListener('click',()=>demonstrateMechanism(b.dataset.mechanism)));
document.querySelectorAll('[data-drink]').forEach(b=>b.addEventListener('click',()=>{
  if(cycle.state.resourceEmpty)return;
  mechanicStop=null;insertGroup();cycle.setDrink(b.dataset.drink);buildChapters();
  document.querySelectorAll('[data-drink]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-pressed',active);});
  $('transport-note').textContent=cycle.drink==='espresso'?'Nur Bohnen und heißes Wasser.':'Milch zuerst, dann Kaffee.';draw();
}));
$('about').addEventListener('click',()=>{$('about-dialog').showModal();});
const closeAbout=()=>$('about-dialog').close();$('close-about').addEventListener('click',closeAbout);$('about-done').addEventListener('click',closeAbout);
document.addEventListener('keydown',e=>{
  if($('about-dialog').open||e.target.closest('button,a,input,select,textarea,[contenteditable="true"]')||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}else if(e.key.toLowerCase()==='r')reset();else if(/^[1-4]$/.test(e.key))setView(['overview','brew','milk','water'][Number(e.key)-1]);
});
document.addEventListener('visibilitychange',()=>{last=performance.now();});
theme.addEventListener('change',()=>{scene?.setTheme(theme.matches?'dark':'light');draw();});
buildChapters();updateUI();
try{
  const {CoffeeScene}=await import('./scene.js');scene=new CoffeeScene($('scene'));scene.setTheme(theme.matches?'dark':'light');scene.setCutaway(cutaway);
  $('loader').hidden=true;$('play').disabled=false;draw();
  window.COFFEESIM=Object.freeze({snapshot:()=>({...cycle.state,playing:cycle.playing,speed:cycle.speed,drink:cycle.drink,view:currentView,cutaway,exploded,labels,scene:scene.inspect()}),seek:t=>{mechanicStop=null;insertGroup();cycle.seek(t);draw();},play:()=>{if(!cycle.playing)togglePlay();},pause:()=>{mechanicStop=null;cycle.pause();draw();},reset,view:setView});
  function frame(now){const dt=Math.min(.1,(now-last)/1000);last=now;if(!document.hidden)cycle.update(dt);if(cycle.state.resourceEmpty)mechanicStop=null;if(mechanicStop!==null&&cycle.time>=mechanicStop){cycle.seek(mechanicStop);cycle.pause();mechanicStop=null;}scene.update(cycle.state,dt);updateAnnotations();uiClock+=dt;if(uiClock>.09){updateUI();uiClock=0;}requestAnimationFrame(frame);}requestAnimationFrame(frame);
  addEventListener('pagehide',()=>scene.dispose(),{once:true});
}catch(error){console.error(error);$('loader').hidden=true;$('scene-error').hidden=false;$('scene-error').textContent='Die 3D-Ansicht konnte nicht gestartet werden. Bitte die Seite über den lokalen Simulator-Server öffnen und WebGL im Browser aktivieren. '+error.message;}
