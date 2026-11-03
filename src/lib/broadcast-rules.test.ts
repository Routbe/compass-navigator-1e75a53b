import {it,expect} from "vitest";
import {broadcastInput,broadcastProvider} from "./broadcast-rules";
it("closed platforms cannot be configured for background publication",()=>{
 for(const provider of ["instagram","snapchat","whatsapp"])expect(broadcastInput.safeParse({provider,token:"credential"}).success).toBe(false);
});
it("webhooks and Mastodon require secure destinations",()=>{
 for(const provider of ["webhook","mastodon"])expect(broadcastInput.safeParse({provider,token:"credential",url:"http://example.com"}).success).toBe(false);
 expect(broadcastInput.safeParse({provider:"webhook",token:"credential",url:"https://example.com/webhook"}).success).toBe(true);
});
it("broadcast credentials occupy a distinct row from public platform identities",()=>{
 expect(broadcastProvider("mastodon")).toBe("omnicast_mastodon");
});