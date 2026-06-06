"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { VehicleSettlementRule } from "@/lib/types";
import { calcSettlementPrice } from "@/lib/import/vehicle-settlement";

type FormState = {
  id?: string;
  plateNo: string;
  driverName: string;
  payeeName: string;
  basePrice: string;
  priceDeduction: string;
  remark: string;
};

const emptyForm = (): FormState => ({
  plateNo: "",
  driverName: "",
  payeeName: "",
  basePrice: "1290",
  priceDeduction: "35",
  remark: "",
});

export function VehicleSettlementManager() {
  const [rules, setRules] = useState<VehicleSettlementRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/import");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setRules(data.vehicleSettlementRules ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载车辆结算档案失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.plateNo.toLowerCase().includes(q) ||
        r.driverName.toLowerCase().includes(q) ||
        r.payeeName.toLowerCase().includes(q)
    );
  }, [rules, searchTerm]);

  const previewSettlement = useMemo(() => {
    const base = Number(form.basePrice) || 0;
    const deduct = Number(form.priceDeduction) || 0;
    return calcSettlementPrice(base, deduct);
  }, [form.basePrice, form.priceDeduction]);

  const openAdd = () => {
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (rule: VehicleSettlementRule) => {
    setForm({
      id: rule.id,
      plateNo: rule.plateNo,
      driverName: rule.driverName,
      payeeName: rule.payeeName,
      basePrice: String(rule.basePrice),
      priceDeduction: String(rule.priceDeduction),
      remark: rule.remark ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.driverName.trim()) {
      toast.error("请填写司机姓名");
      return;
    }
    if (!form.payeeName.trim()) {
      toast.error("请填写收款人");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/import", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "vehicleSettlement",
          action: "upsert",
          item: {
            id: form.id,
            plateNo: form.plateNo,
            driverName: form.driverName,
            payeeName: form.payeeName,
            basePrice: Number(form.basePrice) || 0,
            priceDeduction: Number(form.priceDeduction) || 0,
            remark: form.remark,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      toast.success(form.id ? "已更新" : "已新增");
      setDialogOpen(false);
      await loadRules();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule: VehicleSettlementRule) => {
    if (!confirm(`确定删除「${rule.plateNo || "无车牌"} / ${rule.driverName}」的结算档案？`)) {
      return;
    }
    try {
      const res = await fetch("/api/import", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "vehicleSettlement",
          action: "delete",
          id: rule.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "删除失败");
      toast.success("已删除");
      await loadRules();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-base">车辆结算档案</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            维护车牌、司机与收款人、结算基础价、单价截留；结算价 = 结算基础 − 单价截留
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:shrink-0">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索车牌、司机、收款人…"
              className="w-full pl-9 sm:w-56"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => void loadRules()}
              disabled={loading}
              className="shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={openAdd} className="flex-1 sm:flex-none">
              <Plus className="h-4 w-4 mr-2" />
              新增档案
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">加载中…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {rules.length === 0 ? "暂无档案" : "无匹配结果"}
            </p>
            {rules.length === 0 ? (
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4 mr-2" />
                新增档案
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>车牌</TableHead>
                  <TableHead>司机</TableHead>
                  <TableHead>收款人</TableHead>
                  <TableHead className="text-right">结算基础</TableHead>
                  <TableHead className="text-right">单价截留</TableHead>
                  <TableHead className="text-right">结算价</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono whitespace-nowrap">
                      {rule.plateNo || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{rule.driverName}</TableCell>
                    <TableCell className="whitespace-nowrap">{rule.payeeName}</TableCell>
                    <TableCell className="text-right tabular-nums">¥{rule.basePrice}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      ¥{rule.priceDeduction}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      ¥{rule.settlementPrice}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleDelete(rule)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "编辑" : "新增"}车辆结算档案</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>车牌</Label>
                <Input
                  placeholder="川L81021（可留空仅按司机）"
                  value={form.plateNo}
                  onChange={(e) => setForm((f) => ({ ...f, plateNo: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>司机 *</Label>
                <Input
                  value={form.driverName}
                  onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>收款人 *</Label>
              <Input
                value={form.payeeName}
                onChange={(e) => setForm((f) => ({ ...f, payeeName: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>结算基础</Label>
                <Input
                  type="number"
                  value={form.basePrice}
                  onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>单价截留</Label>
                <Input
                  type="number"
                  value={form.priceDeduction}
                  onChange={(e) => setForm((f) => ({ ...f, priceDeduction: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>结算价</Label>
                <Input value={String(previewSettlement)} disabled className="font-medium" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Input
                value={form.remark}
                onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
