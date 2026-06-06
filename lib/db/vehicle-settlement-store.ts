import type { VehicleSettlementRule } from "@/lib/types";
import { DEFAULT_VEHICLE_SETTLEMENT_RULES } from "@/lib/db/seed-vehicle-settlement";
import {
  calcSettlementPrice,
  normPersonName,
  normPlateNo,
} from "@/lib/import/vehicle-settlement";
import { writeSplitStoreKey } from "@/lib/db/data-files";
import { generateId, getStore, nowString } from "@/lib/db/store";

export type VehicleSettlementInput = {
  id?: string;
  plateNo?: string;
  driverName: string;
  payeeName: string;
  basePrice: number;
  priceDeduction: number;
  remark?: string;
  enabled?: boolean;
};

function buildRule(input: VehicleSettlementInput): VehicleSettlementRule {
  const now = nowString();
  const basePrice = Number(input.basePrice) || 0;
  const priceDeduction = Number(input.priceDeduction) || 0;
  return {
    id: input.id ?? generateId("VS"),
    plateNo: normPlateNo(input.plateNo ?? ""),
    driverName: normPersonName(input.driverName),
    payeeName: normPersonName(input.payeeName),
    basePrice,
    priceDeduction,
    settlementPrice: calcSettlementPrice(basePrice, priceDeduction),
    remark: input.remark?.trim() ?? "",
    enabled: input.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
}

export function ensureVehicleSettlementRulesSeeded() {
  const store = getStore();
  if (store.vehicleSettlementRules?.length) return store.vehicleSettlementRules;

  const seeded = DEFAULT_VEHICLE_SETTLEMENT_RULES.map((row) =>
    buildRule({ ...row, enabled: true })
  );
  store.vehicleSettlementRules = seeded;
  writeSplitStoreKey("vehicleSettlementRules", seeded);
  return seeded;
}

export function listVehicleSettlementRules(): VehicleSettlementRule[] {
  const store = getStore();
  const rules = store.vehicleSettlementRules ?? [];
  if (rules.length === 0) {
    return ensureVehicleSettlementRulesSeeded();
  }
  return rules;
}

export function upsertVehicleSettlementRule(
  input: VehicleSettlementInput
): VehicleSettlementRule {
  const store = getStore();
  const rules = store.vehicleSettlementRules ?? [];
  const now = nowString();
  const driver = normPersonName(input.driverName);
  const plate = normPlateNo(input.plateNo ?? "");

  if (!driver) {
    throw new Error("司机姓名不能为空");
  }
  if (!normPersonName(input.payeeName)) {
    throw new Error("收款人不能为空");
  }

  const duplicate = rules.find((r) => {
    if (input.id && r.id === input.id) return false;
    return (
      normPersonName(r.driverName) === driver && normPlateNo(r.plateNo) === plate
    );
  });
  if (duplicate) {
    throw new Error("相同车牌与司机的档案已存在");
  }

  const basePrice = Number(input.basePrice) || 0;
  const priceDeduction = Number(input.priceDeduction) || 0;

  if (input.id) {
    const index = rules.findIndex((r) => r.id === input.id);
    if (index === -1) throw new Error("记录不存在");
    const prev = rules[index];
    rules[index] = {
      ...prev,
      plateNo: plate,
      driverName: driver,
      payeeName: normPersonName(input.payeeName),
      basePrice,
      priceDeduction,
      settlementPrice: calcSettlementPrice(basePrice, priceDeduction),
      remark: input.remark?.trim() ?? "",
      enabled: input.enabled !== false,
      updatedAt: now,
    };
    store.vehicleSettlementRules = rules;
    writeSplitStoreKey("vehicleSettlementRules", rules);
    return rules[index];
  }

  const created = buildRule({ ...input, plateNo: plate, driverName: driver });
  created.createdAt = now;
  created.updatedAt = now;
  store.vehicleSettlementRules = [created, ...rules];
  writeSplitStoreKey("vehicleSettlementRules", store.vehicleSettlementRules);
  return created;
}

export function deleteVehicleSettlementRule(id: string): boolean {
  const store = getStore();
  const rules = store.vehicleSettlementRules ?? [];
  const next = rules.filter((r) => r.id !== id);
  if (next.length === rules.length) return false;
  store.vehicleSettlementRules = next;
  writeSplitStoreKey("vehicleSettlementRules", next);
  return true;
}
