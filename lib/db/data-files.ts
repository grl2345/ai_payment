import fs from "fs";
import path from "path";
import { getSupabaseAdmin, isSupabaseEnabled } from "@/lib/db/supabase";
import type { DataStore } from "@/lib/types";

export const DATA_DIR = path.join(process.cwd(), "data");

/** 各类业务数据分文件存放，便于查看、备份与单独维护 */
export const DATA_FILE_PATHS = {
  uploads: path.join(DATA_DIR, "uploads.json"),
  measureTickets: path.join(DATA_DIR, "measure-tickets.json"),
  inboundRecords: path.join(DATA_DIR, "inbound-records.json"),
  ticketMatches: path.join(DATA_DIR, "ticket-matches.json"),
  paymentDetails: path.join(DATA_DIR, "payment-details.json"),
  vehicleSettlementRules: path.join(DATA_DIR, "vehicle-settlement-rules.json"),
} as const satisfies Record<keyof DataStore, string>;

const LEGACY_STORE_FILE = path.join(DATA_DIR, "store.json");
const LEGACY_BACKUP_FILE = path.join(DATA_DIR, "store.json.backup");

export type DataStoreKey = keyof DataStore;

const STORE_KEY_TO_DB: Record<DataStoreKey, string> = {
  uploads: "uploads",
  measureTickets: "measure_tickets",
  inboundRecords: "inbound_records",
  ticketMatches: "ticket_matches",
  paymentDetails: "payment_details",
  vehicleSettlementRules: "vehicle_settlement_rules",
};

const DB_KEY_TO_STORE = Object.fromEntries(
  Object.entries(STORE_KEY_TO_DB).map(([k, v]) => [v, k])
) as Record<string, DataStoreKey>;

const EMPTY_STORE: DataStore = {
  uploads: [],
  measureTickets: [],
  inboundRecords: [],
  ticketMatches: [],
  paymentDetails: [],
  vehicleSettlementRules: [],
};

function readJsonArray<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(filePath: string, data: T[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function readSplitStoreLocal(): DataStore {
  return {
    uploads: readJsonArray(DATA_FILE_PATHS.uploads),
    measureTickets: readJsonArray(DATA_FILE_PATHS.measureTickets),
    inboundRecords: readJsonArray(DATA_FILE_PATHS.inboundRecords),
    ticketMatches: readJsonArray(DATA_FILE_PATHS.ticketMatches),
    paymentDetails: readJsonArray(DATA_FILE_PATHS.paymentDetails),
    vehicleSettlementRules: readJsonArray(DATA_FILE_PATHS.vehicleSettlementRules),
  };
}

function writeSplitStoreLocal(store: DataStore) {
  writeJsonArray(DATA_FILE_PATHS.uploads, store.uploads);
  writeJsonArray(DATA_FILE_PATHS.measureTickets, store.measureTickets);
  writeJsonArray(DATA_FILE_PATHS.inboundRecords, store.inboundRecords);
  writeJsonArray(DATA_FILE_PATHS.ticketMatches, store.ticketMatches);
  writeJsonArray(DATA_FILE_PATHS.paymentDetails, store.paymentDetails);
  writeJsonArray(
    DATA_FILE_PATHS.vehicleSettlementRules,
    store.vehicleSettlementRules
  );
}

function writeSplitStoreKeyLocal<K extends DataStoreKey>(
  key: K,
  data: DataStore[K]
) {
  writeJsonArray(DATA_FILE_PATHS[key], data as unknown[]);
}

async function ensureSupabaseInitialized(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("app_data")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`读取数据库失败: ${error.message}`);
  if ((count ?? 0) === 0) {
    await writeSplitStoreSupabase(EMPTY_STORE);
  }
}

async function readSplitStoreSupabase(): Promise<DataStore> {
  await ensureSupabaseInitialized();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("app_data").select("key, data");
  if (error) throw new Error(`读取数据库失败: ${error.message}`);

  const store: DataStore = { ...EMPTY_STORE, vehicleSettlementRules: [] };
  for (const row of data ?? []) {
    const storeKey = DB_KEY_TO_STORE[row.key as string];
    if (storeKey && Array.isArray(row.data)) {
      store[storeKey] = row.data as never;
    }
  }
  return store;
}

async function writeSplitStoreSupabase(store: DataStore): Promise<void> {
  const supabase = getSupabaseAdmin();
  const rows = (Object.keys(STORE_KEY_TO_DB) as DataStoreKey[]).map((key) => ({
    key: STORE_KEY_TO_DB[key],
    data: store[key],
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("app_data").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(`写入数据库失败: ${error.message}`);
}

async function writeSplitStoreKeySupabase<K extends DataStoreKey>(
  key: K,
  data: DataStore[K]
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("app_data").upsert(
    {
      key: STORE_KEY_TO_DB[key],
      data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) throw new Error(`写入数据库失败: ${error.message}`);
}

export function hasSplitDataFiles(): boolean {
  if (isSupabaseEnabled()) return true;
  return Object.values(DATA_FILE_PATHS).some((p) => fs.existsSync(p));
}

export async function readSplitStore(): Promise<DataStore> {
  if (isSupabaseEnabled()) {
    return readSplitStoreSupabase();
  }
  return readSplitStoreLocal();
}

export async function writeSplitStore(store: DataStore): Promise<void> {
  if (isSupabaseEnabled()) {
    await writeSplitStoreSupabase(store);
    return;
  }
  writeSplitStoreLocal(store);
}

export async function writeSplitStoreKey<K extends DataStoreKey>(
  key: K,
  data: DataStore[K]
): Promise<void> {
  if (isSupabaseEnabled()) {
    await writeSplitStoreKeySupabase(key, data);
    return;
  }
  writeSplitStoreKeyLocal(key, data);
}

function readLegacyStore(): DataStore | null {
  if (!fs.existsSync(LEGACY_STORE_FILE)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(LEGACY_STORE_FILE, "utf-8")) as Partial<DataStore>;
    return {
      uploads: raw.uploads ?? [],
      measureTickets: raw.measureTickets ?? [],
      inboundRecords: raw.inboundRecords ?? [],
      ticketMatches: raw.ticketMatches ?? [],
      paymentDetails: raw.paymentDetails ?? [],
      vehicleSettlementRules: raw.vehicleSettlementRules ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * 若仍存在旧的 store.json，则拆分到各 json 并备份原文件（仅本地模式）。
 */
export async function migrateLegacyStoreIfNeeded(): Promise<boolean> {
  if (isSupabaseEnabled()) return false;
  if (hasSplitDataFiles()) return false;

  const legacy = readLegacyStore();
  if (!legacy) {
    await writeSplitStore({
      uploads: [],
      measureTickets: [],
      inboundRecords: [],
      ticketMatches: [],
      paymentDetails: [],
      vehicleSettlementRules: [],
    });
    return false;
  }

  await writeSplitStore(legacy);

  if (fs.existsSync(LEGACY_STORE_FILE)) {
    fs.renameSync(LEGACY_STORE_FILE, LEGACY_BACKUP_FILE);
  }

  return true;
}

export function getDataFileLabel(key: DataStoreKey): string {
  const labels: Record<DataStoreKey, string> = {
    uploads: "上传记录 uploads.json",
    measureTickets: "计量单 measure-tickets.json",
    inboundRecords: "入库单 inbound-records.json",
    ticketMatches: "单据匹配 ticket-matches.json",
    paymentDetails: "付款明细 payment-details.json",
    vehicleSettlementRules: "车辆结算档案 vehicle-settlement-rules.json",
  };
  return labels[key];
}
