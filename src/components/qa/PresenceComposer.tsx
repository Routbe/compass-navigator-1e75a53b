import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Radio, Send, Share2, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { postPresence } from "@/lib/presence.functions";
import { presenceKey, spotlightCandidates, type StatusInput } from "@/lib/presence";
import { pendingStatuses,savePending,removePending } from "@/lib/presence-local";
import { shareStoryFile,supportsStoryShare } from "@/lib/qa/native-share";
import type { ProfileBlock } from "@/lib/profile";
import { ProceduralStoryBackground } from "./ProceduralStoryBackground";

export function PresenceComposer({owner,handle,space,blocks}:{owner:string;handle:string;space:"root"|"alias";blocks:ProfileBlock[]}) {
 const {t}=useI18n();const query=useQueryClient();const post=useServerFn(postPresence);
 const [open,setOpen]=useState(false),[mode,setMode]=useState<"text"|"grid">("text"),[text,setText]=useState("");
 const [selected,setSelected]=useState(""),[busy,setBusy]=useState(false),[pending,setPending]=useState<StatusInput[]>([]);
 const [file,setFile]=useState<File|null>(null),[encoding,setEncoding]=useState(false);
 const candidates=spotlightCandidates(blocks);
 useEffect(()=>{void pendingStatuses(owner).then(rows=>setPending(rows.filter(r=>r.input.space===space).map(r=>r.input))).catch(()=>undefined);},[owner,space]);
 // Prepare before the sharing click: recording for 3 seconds cannot preserve transient OS activation.
 useEffect(()=>{setFile(null);if(!open || mode!=="text" || !text.trim() || [...text].length>280) return;
  const controller=new AbortController();let alive=true;const timeout=setTimeout(()=>{setEncoding(true);void import("@/lib/qa/story-video").then(m=>m.renderPresenceVideo(text,controller.signal)).then(f=>{if(alive)setFile(f);}).catch(()=>undefined).finally(()=>{if(alive)setEncoding(false);});},600);
  return()=>{alive=false;clearTimeout(timeout);controller.abort();setEncoding(false);};
 },[open,text,mode]);
 const send=async(input:StatusInput)=>{
  setBusy(true);
  try {
   await savePending(owner,handle,input);setPending(rows=>[...rows.filter(r=>r.id!==input.id),input]);
   window.dispatchEvent(new CustomEvent("rout-presence-pending",{detail:{owner,handle,space,input}}));
   await post({data:input});await removePending(owner,input.id);setPending(rows=>rows.filter(r=>r.id!==input.id));
   await query.invalidateQueries({queryKey:presenceKey(space,handle)});window.dispatchEvent(new CustomEvent("rout-presence-confirmed",{detail:{id:input.id}}));
   setOpen(false);setText("");toast.success(t("presence.sent"));
  } catch {toast.error(t("presence.pending"));}finally{setBusy(false);}
 };
 const submit=()=>{const candidate=candidates.find(c=>`${c.blockId}:${c.itemId??""}`===selected);if(mode==="grid"&&!candidate)return;
  const id=crypto.randomUUID();void send(mode==="text"?{id,space,statusType:"micro_text",payload:{text:text.trim(),theme:"aurora"}}:{id,space,statusType:"omni_drop",payload:{blockId:candidate?.blockId ?? "",...(candidate?.itemId?{itemId:candidate.itemId}:{})}});
 };
 return <>
  <Button variant="outline" className="w-full justify-start gap-2" onClick={()=>setOpen(true)}><Radio className="h-4 w-4"/>{t("presence.update")}</Button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md"><DialogHeader><DialogTitle>{t("presence.update")}</DialogTitle></DialogHeader>
   <div className="flex gap-2"><Button variant={mode==="text"?"default":"outline"} onClick={()=>setMode("text")}>{t("presence.write")}</Button><Button variant={mode==="grid"?"default":"outline"} onClick={()=>setMode("grid")}>{t("presence.grid")}</Button></div>
   {mode==="text"?<>
    <div className="relative mx-auto flex aspect-[9/16] max-h-64 w-36 items-center justify-center overflow-hidden rounded-lg bg-story-viewport text-story-card"><ProceduralStoryBackground/><p className="relative break-words px-3 text-center text-sm font-semibold">{text}</p></div>
    <Textarea aria-label={t("presence.write")} value={text} onChange={e=>setText(e.target.value)} rows={4}/><span className="text-xs text-muted-foreground">{[...text].length}/280</span>
    {encoding&&<Loader2 aria-label={t("presence.encoding")} className="h-4 w-4 animate-spin"/>}
    {file&&<Button variant="outline" onClick={()=>{if(supportsStoryShare(file))void shareStoryFile(file).catch(()=>toast.error(t("presence.shareFailed")));else {const url=URL.createObjectURL(file);const a=document.createElement("a");a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}}>{supportsStoryShare(file)?<Share2 className="h-4 w-4"/>:<Download className="h-4 w-4"/>}{t(supportsStoryShare(file)?"presence.share":"presence.download")}</Button>}
   </>:<div className="space-y-1">{candidates.length?candidates.map(c=><Button key={`${c.blockId}:${c.itemId??""}`} variant={selected===`${c.blockId}:${c.itemId??""}`?"default":"outline"} className="w-full justify-start truncate" onClick={()=>setSelected(`${c.blockId}:${c.itemId??""}`)}>{c.title}</Button>):<p className="text-sm text-muted-foreground">{t("presence.noGrid")}</p>}</div>}
   <Button disabled={busy||(mode==="text"?(!text.trim()||[...text].length>280):!selected)} onClick={submit}><Send className="h-4 w-4"/>{t("presence.publish")}</Button>
   {pending.map(input=><div key={input.id} className="flex gap-2 border-t border-border pt-2"><Button variant="outline" disabled={busy} onClick={()=>void send(input)}>{t("presence.retry")}</Button><Button variant="ghost" size="icon" aria-label={t("presence.discard")} onClick={()=>void removePending(owner,input.id).then(()=>setPending(rows=>rows.filter(r=>r.id!==input.id)))}><Trash2 className="h-4 w-4"/></Button></div>)}
  </DialogContent></Dialog>
 </>;
}