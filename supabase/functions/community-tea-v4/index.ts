import { createCommunityTeaHandler } from "../community-tea/handler.ts";

Deno.serve(createCommunityTeaHandler({ pilot: true }));
