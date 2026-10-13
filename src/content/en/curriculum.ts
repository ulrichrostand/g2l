import { genesisModuleEn } from "./modules/00-genesis";
import { kernelModuleEn } from "./modules/01-kernel";
import { shellModuleEn } from "./modules/02-shell";
import { branchModuleEn } from "./modules/03-branch";
import { packetModuleEn } from "./modules/04-packet";
import { gatewayModuleEn } from "./modules/05-gateway";
import { containerModuleEn } from "./modules/06-container";
import { nimbusModuleEn } from "./modules/07-nimbus";
import { blueprintModuleEn } from "./modules/08-blueprint";
import { puppeteerModuleEn } from "./modules/09-puppeteer";
import { pipelineModuleEn } from "./modules/10-pipeline";
import { vaultModuleEn } from "./modules/11-vault";
import { helmModuleEn } from "./modules/12-helm";
import { syncModuleEn } from "./modules/13-sync";
import { watchtowerModuleEn } from "./modules/14-watchtower";
import { architectModuleEn } from "./modules/15-architect";
import type { DevOpsModule } from "../types";

/** Même ordre que le français : un module d'introduction, puis la roadmap DevOps de roadmap.sh. */
export const CURRICULUM_EN: readonly DevOpsModule[] = [
  genesisModuleEn,
  kernelModuleEn,
  shellModuleEn,
  branchModuleEn,
  packetModuleEn,
  gatewayModuleEn,
  containerModuleEn,
  nimbusModuleEn,
  blueprintModuleEn,
  puppeteerModuleEn,
  pipelineModuleEn,
  vaultModuleEn,
  helmModuleEn,
  syncModuleEn,
  watchtowerModuleEn,
  architectModuleEn,
];
