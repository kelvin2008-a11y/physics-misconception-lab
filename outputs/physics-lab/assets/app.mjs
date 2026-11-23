import {DEFAULT_API_KEY,BACKEND_URL} from './config.mjs';
import {initMemory} from './memory.mjs';
import {checkFiles,prepareImage,requestDiagnosis,demo,exportReport,redact,redactTree} from './core.mjs';
const $=id=>document.getElementById(id);
let images=[],diagnosis=null,source='',hints=0,controller=null,busy=false,processing=false,uploadVersion=0;
const status=(text,state='idle')=>{$('status').textContent=text;$('status').dataset.state=state;};
function node(tag,text,className=''){const e=document.createElement(tag);e.textContent=text;e.className=className;return e;}
function clearExport(){$('export-area').hidden=true;$('privacy-confirm').checked=false;$('export-preview').value='';$('print-report').textContent='';}
function resetResult(){diagnosis=null;$('result').hidden=true;$('empty').hidden=false;$('practice').hidden=true;$('review-panel').hidden=true;$('retry-result').replaceChildren();clearExport();}
function previews(){for(const role of ['problem','solution']){const target=$(role+'-previews');target.replaceChildren();images.forEach((im,index)=>{if(im.role!==role)return;const box=node('div','','preview');const open=node('button','');open.type='button';open.setAttribute('aria-label',`${role==='problem'?'문제':'풀이'} 이미지 ${index+1} 확대`);const pic=document.createElement('img');pic.src=im.data;pic.alt=`${role==='problem'?'문제':'풀이'} 미리보기`;open.append(pic);open.onclick=()=>{$('large-image').src=im.data;$('image-dialog').showModal();};const remove=node('button','이미지 삭제');remove.type='button';remove.disabled=busy||processing;remove.onclick=()=>{images.splice(index,1);resetResult();previews();};box.append(open,node('small',`${im.width} × ${im.height}px`),remove);target.append(box);});}}
function locks(){for(const id of ['analyze','recheck','demo','load-case','preset','focus-only','case-select'])$(id).disabled=busy||processing;$('input-fields').disabled=busy||processing;$('cancel').disabled=!busy;previews();}
for(const role of ['problem','solution']) $(role+'-images').onchange=async e=>{
 const files=[...e.target.files];e.target.value='';if(!files.length)return;
 const version=uploadVersion;processing=true;locks();
 try{checkFiles(images,files);const prepared=[];for(const file of files)prepared.push(await prepareImage(file,role));if(version!==uploadVersion)return;images.push(...prepared);resetResult();status('이미지를 준비했습니다. 확대 미리보기에서 글씨가 선명한지 확인하세요.');}
 catch(e){status(e.message,'error');}finally{processing=false;locks();}
};
$('close-image').onclick=()=>{$('image-dialog').close();$('large-image').removeAttribute('src');};
$('clear-key').onclick=()=>{$('api-key').value='';controller?.abort();clearExport();status('API 키를 지웠습니다. 진행 중 요청은 취소됩니다.');};
window.addEventListener('pagehide',()=>{$('api-key').value='';controller?.abort();images=[];uploadVersion++;});
for(const id of ['problem','solution','rubric'])$(id).addEventListener('input',resetResult);
function drawDiagnosis(target,d){target.replaceChildren();target.append(node('h3',d.status==='abstain'?'판단을 보류합니다':'풀이에서 찾은 연결고리'),node('p',`근거 확신도 ${Math.round(d.confidence*100)}% · 정답 확률이 아닙니다`));
 if(d.status==='abstain')target.append(node('p',d.abstentionReason));
 target.append(node('h3','읽어낸 풀이'),node('p',d.transcription));
 if(d.correct.length){target.append(node('h3','잘 이해한 부분'));d.correct.forEach(t=>target.append(node('p','✓ '+t)));}
 const labels={conceptual:'개념',algebra:'계산',unit:'단위',omission:'누락'};
 for(const f of d.findings){const card=node('article','','finding');card.append(node('strong',labels[f.kind]+' 점검'),node('blockquote',f.evidence),node('small','근거 위치: '+f.location),node('p',f.explanation),node('p','다시 연결하기: '+f.correction));target.append(card);}
 if(d.forceAnalysis.relevant){const f=d.forceAnalysis;target.append(node('h3','힘의 주체와 대상'),node('p',`${f.giver} → ${f.recipient}\n반작용: ${f.reactionGiver} → ${f.reactionRecipient}\n평형 대상: ${f.equilibriumBody}\n${f.explanation}`));}
}
function show(d,origin,usage=null){diagnosis=d;source=origin;hints=0;$('empty').hidden=true;$('result').hidden=false;$('source').textContent=origin;drawDiagnosis($('diagnosis'),d);if(usage)$('diagnosis').append(node('p',`실제 API 토큰: 입력 ${usage.input_tokens} · 출력 ${usage.output_tokens} · 합계 ${usage.total_tokens}`,'muted'));
 $('hints').replaceChildren();$('next-hint').textContent='첫 번째 힌트 보기';$('next-hint').disabled=false;$('reference').hidden=true;$('reference').textContent='';$('learning').hidden=d.status==='abstain';$('practice').hidden=d.status==='abstain';$('retry-question').textContent=d.retryQuestion;$('retry-answer').value='';$('retry-result').replaceChildren();$('review-panel').hidden=false;$('review-status').value='pending';$('review-correction').value='';clearExport();
}
async function run(retry=false){if(busy||processing)return;busy=true;controller=new AbortController();locks();status(retry?'재도전 답안을 확인하는 중입니다…':'풀이를 심층 분석하고 검산하는 중입니다. 수 분 걸릴 수 있습니다…','loading');
 try{let input;if(retry){if(!diagnosis||!$('retry-answer').value.trim())throw Error('재도전 답안을 입력해 주세요.');input={problem:diagnosis.retryQuestion,solution:$('retry-answer').value,images:[],retry:{question:diagnosis.retryQuestion},model:$('model').value};$('retry-result').replaceChildren();}else{resetResult();input={problem:$('problem').value,solution:$('solution').value,rubric:$('rubric').value,images:[...images],model:$('model').value};}
 input.rubric=(input.rubric||'')+learningMemory.context(input.problem);
 const {diagnosis:d,usage,analysis}=await requestDiagnosis(input,$('api-key').value,{signal:controller.signal,backendUrl:BACKEND_URL});
 if(retry){drawDiagnosis($('retry-result'),d);if(usage)$('retry-result').append(node('p',`실제 API 토큰 합계 ${usage.total_tokens}`));}else show(d,'개인 자료 · API 진단 (교사 확인 권장)',usage);
 if(typeof analysis?.model==='string' && Number.isFinite(analysis.estimatedCostUsd))$(retry?'retry-result':'diagnosis').append(node('p',`사용 모델 ${analysis.model} · 심층 분석 · 이번 요청 예상 $${analysis.estimatedCostUsd.toFixed(4)} (캐시 할인 제외, 실제 청구와 다를 수 있음)`,'muted'));
 status(d.status==='abstain'?'자료가 부족하여 판단을 보류했습니다. 추가 자료를 확인해 주세요.':'분석을 마쳤습니다. 근거와 힌트를 확인하세요.','success');
 }catch(e){status(e.message,'error');if(retry)$('retry-result').replaceChildren(node('p',e.message));}finally{busy=false;controller=null;locks();}}
$('retry-answer').oninput=()=>{$('retry-result').replaceChildren();};
$('diagnose-form').onsubmit=e=>{e.preventDefault();run();};$('cancel').onclick=()=>controller?.abort();$('recheck').onclick=()=>run(true);
$('demo').onclick=()=>{show(structuredClone(demo),'합성 데모 · 로컬 예시 · 실제 분석 아님');status('합성 데모입니다. API 요청 없이 학습 흐름을 체험합니다.');$('analysis').scrollIntoView({behavior:'smooth'});};
$('next-hint').onclick=()=>{if(!diagnosis||hints>=3)return;$('hints').append(node('li',diagnosis.hints[hints++]));$('next-hint').textContent=hints===3?'세 힌트를 모두 확인했어요':`${hints+1}번째 힌트 보기`;$('next-hint').disabled=hints===3;};
$('full-solution').onclick=()=>{if(diagnosis){$('reference').textContent=diagnosis.referenceSolution;$('reference').hidden=false;}};
for(const id of ['review-status','review-correction'])$(id).oninput=clearExport;
$('preview').onclick=()=>{if(!diagnosis)return;if($('review-status').value==='corrected'&&!$('review-correction').value.trim()){status('수정 내용을 입력해 주세요.','error');return;}const report=exportReport(diagnosis,{status:$('review-status').value,correction:$('review-correction').value},source,$('api-key').value);$('export-preview').value=JSON.stringify(report,null,2);$('privacy-confirm').checked=false;$('export-area').hidden=false;};
$('export-preview').oninput=()=>{$('privacy-confirm').checked=false;};
function approvedReport(){if(!$('privacy-confirm').checked)throw Error('개인정보 확인란을 선택해 주세요.');let parsed;try{parsed=JSON.parse($('export-preview').value);}catch{throw Error('내보낼 JSON 형식을 확인해 주세요.');}const clean=JSON.stringify(redactTree(parsed,$('api-key').value),null,2);if(clean!==$('export-preview').value){$('export-preview').value=clean;$('privacy-confirm').checked=false;throw Error('남은 식별정보를 제거했습니다. 갱신된 미리보기를 확인한 뒤 다시 동의해 주세요.');}return clean;}
$('download').onclick=()=>{try{const blob=new Blob([approvedReport()],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='physics-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){status(e.message,'error');}};
$('print').onclick=()=>{try{$('print-report').textContent=approvedReport();window.print();}catch(e){status(e.message,'error');}};
let library=null,visibleCases=[];
function filterCases(){const selected=$('preset').value;const preset=selected===''?null:library.presets[Number(selected)];visibleCases=library.cases.filter(c=>(!preset||(c.homework===preset.homework&&c.question_number===preset.question_number))&&(!$('focus-only').checked||c.focus));$('case-select').replaceChildren(...visibleCases.map((c,i)=>{const o=node('option',`과제 ${c.homework} · ${c.question_number}번 / ${c.subpart} · ${c.style} · ${c.error_type}`);o.value=i;return o;}));caseDetail();}
function caseDetail(){const c=visibleCases[Number($('case-select').value)];$('case-detail').replaceChildren();$('load-case').disabled=!c||busy||processing;if(c)$('case-detail').append(node('p',c.problem),node('h3','합성 풀이'),node('p',c.wrong_solution),node('p','개념 점검: '+c.error_cause),node('p','힌트: '+c.correction_hint));else $('case-detail').append(node('p','이 조건에 해당하는 합성 사례가 없습니다.'));}
$('preset').onchange=filterCases;$('focus-only').onchange=filterCases;$('case-select').onchange=caseDetail;
$('load-case').onclick=()=>{const c=visibleCases[Number($('case-select').value)];if(!c)return;images=[];previews();$('problem').value=c.problem;$('solution').value=c.wrong_solution;const preset=library.presets.find(p=>p.homework===c.homework&&p.question_number===c.question_number);$('rubric').value=preset?'정답 기준: '+preset.reference+'\n채점 참고: '+preset.rubric:'';resetResult();status('합성 사례를 입력했습니다. 분석 버튼은 공용 서버 또는 입력한 개인 키로 API를 호출합니다.');$('workspace').scrollIntoView({behavior:'smooth'});};
fetch(new URL('./cases.json',import.meta.url)).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{library=data;for(const [i,p] of library.presets.entries()){const o=node('option',`과제 ${p.homework} · ${p.question_number}번`);o.value=i;$('preset').append(o);}filterCases();}).catch(()=>{$('case-detail').textContent='합성 자료를 불러오지 못했습니다. 페이지를 다시 열어 주세요.';$('load-case').disabled=true;});

const learningMemory=initMemory({getKey:()=>$('api-key').value,getDraft:()=>diagnosis?{topic:$('problem').value.trim()||diagnosis.transcription,correction:$('review-status').value==='corrected'?$('review-correction').value:diagnosis.referenceSolution}:null,setStatus:status});

// Set the configured default only on initial page load.
document.getElementById("api-key").value=DEFAULT_API_KEY;
