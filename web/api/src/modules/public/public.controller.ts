import type { Request, Response } from "express";
import { getPublicCmsPayload, getPublicPlansPayload, getPublicSiteConfig } from "./public.service.js";

export async function publicCmsController(_request: Request, response: Response) {
  const payload = await getPublicCmsPayload();
  response.json(payload);
}

export async function publicSiteConfigController(_request: Request, response: Response) {
  const config = await getPublicSiteConfig();
  response.json(config);
}

export async function publicPlansController(_request: Request, response: Response) {
  const payload = await getPublicPlansPayload();
  response.json(payload);
}
