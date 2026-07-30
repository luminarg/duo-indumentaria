"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireTeamMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  return user;
}

function num(formData: FormData, key: string) {
  const raw = String(formData.get(key) || "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function str(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function optionalStr(formData: FormData, key: string) {
  return str(formData, key) || null;
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

export async function createSupplier(formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const name = str(formData, "name");
  if (!name) throw new Error("Falta el nombre del proveedor");

  const { error } = await supabase.from("suppliers").insert({
    name,
    contact_name: optionalStr(formData, "contact_name"),
    phone: optionalStr(formData, "phone"),
    email: optionalStr(formData, "email"),
    notes: optionalStr(formData, "notes"),
  });
  if (error) throw new Error("No se pudo crear el proveedor: " + error.message);

  revalidatePath("/panel/compras");
}

export async function deleteSupplier(supplierId: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").delete().eq("id", supplierId);
  if (error) throw new Error("No se pudo borrar el proveedor: " + error.message);
  revalidatePath("/panel/compras");
}

// ---------------------------------------------------------------------------
// Compras (incluye gastos generales, con categoría y sin proveedor)
// ---------------------------------------------------------------------------

export async function createPurchase(formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const description = str(formData, "description");
  if (!description) throw new Error("Falta la descripción");

  const purchaseDate = str(formData, "purchase_date") || new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("purchases").insert({
    description,
    order_id: optionalStr(formData, "order_id"),
    supplier_id: optionalStr(formData, "supplier_id"),
    category: optionalStr(formData, "category"),
    budgeted_cost: num(formData, "budgeted_cost"),
    real_cost: num(formData, "real_cost"),
    purchase_date: purchaseDate,
  });
  if (error) throw new Error("No se pudo crear la compra: " + error.message);

  revalidatePath("/panel/compras");
}

export async function updatePurchaseRealCost(purchaseId: string, formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();

  const realCost = num(formData, "real_cost");

  const { error } = await supabase.from("purchases").update({ real_cost: realCost }).eq("id", purchaseId);
  if (error) throw new Error("No se pudo actualizar el costo real: " + error.message);

  revalidatePath("/panel/compras");
}

export async function deletePurchase(purchaseId: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("purchases").delete().eq("id", purchaseId);
  if (error) throw new Error("No se pudo borrar la compra: " + error.message);
  revalidatePath("/panel/compras");
}
