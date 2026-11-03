import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth/middleware";
import { statusInput } from "./presence";
export const getPublicPresence=createServerFn({method:"GET"})
 .inputValidator((input:unknown)=>z.object({handle:z.string().regex(/^@?[A-Za-z0-9._-]{1,64}$/),space:z.enum(["root","alias"])}).parse(input))
 .handler(async({data})=>{const {publicPresence}=await import("./presence.server");return {stories:await publicPresence(data.handle.replace(/^@/,""),data.space)};});
export const postPresence=createServerFn({method:"POST"}).middleware([requireAuth])
 .inputValidator((input:unknown)=>statusInput.parse(input))
 .handler(async({data,context})=>{const {createPresence}=await import("./presence.server");return {story:await createPresence(context.userId,data)};});