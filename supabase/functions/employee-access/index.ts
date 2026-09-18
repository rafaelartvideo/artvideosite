import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const PLATFORM_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;

function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function validUsername(value: string) {
  return usernamePattern.test(value);
}

function internalAuthEmail(employeeId: string) {
  return `employee-${employeeId}@auth.artvideo.app`;
}

function authFailureMessage(error: any, action: "create" | "update") {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  if (code === "weak_password" || code.includes("password") || message.includes("password")) {
    return action === "create"
      ? "A senha informada não atende aos requisitos de segurança."
      : "A nova senha não atende aos requisitos de segurança.";
  }
  return action === "create"
    ? "Não foi possível criar o usuário de acesso."
    : "Não foi possível atualizar a senha do usuário.";
}

async function authenticatedUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await authClient.auth.getUser(token);
  if (error) return null;
  return data.user ?? null;
}

async function roleHasPermission(roleId: string | null, permissionKey: string) {
  if (!roleId) return false;
  const { data, error } = await adminClient
    .from("role_permissions")
    .select("permission_id,permissions!inner(key)")
    .eq("role_id", roleId)
    .eq("permissions.key", permissionKey)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function userHasOverride(organizationId: string, userId: string, permissionKey: string) {
  const { data, error } = await adminClient
    .from("user_permission_overrides")
    .select("permission_id,permissions!inner(key)")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("permissions.key", permissionKey)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function membershipPermission(userId: string, organizationId: string, permissionKey: string) {
  const { data: membership, error } = await adminClient
    .from("organization_members")
    .select("role_id,status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!membership || membership.status !== "active") return false;
  return await roleHasPermission(membership.role_id, permissionKey)
    || await userHasOverride(organizationId, userId, permissionKey);
}

async function hasEffectivePermission(userId: string, organizationId: string, permissionKey: string) {
  const { data: organization, error } = await adminClient
    .from("organizations")
    .select("id,status")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!organization || organization.status !== "active") return false;

  if (await membershipPermission(userId, organizationId, permissionKey)) return true;
  if (organizationId === PLATFORM_ORGANIZATION_ID) return false;

  const { data: platform, error: platformError } = await adminClient
    .from("organizations")
    .select("id,status,settings")
    .eq("id", PLATFORM_ORGANIZATION_ID)
    .maybeSingle();
  if (platformError) throw platformError;
  if (!platform || platform.status !== "active" || platform.settings?.is_platform_operator !== true) return false;

  const canManagePartners = await membershipPermission(
    userId,
    PLATFORM_ORGANIZATION_ID,
    "organizations.view",
  );
  if (!canManagePartners) return false;

  return membershipPermission(userId, PLATFORM_ORGANIZATION_ID, permissionKey);
}

async function employeeModuleEnabled(organizationId: string) {
  const { data, error } = await adminClient
    .from("organization_modules")
    .select("is_enabled")
    .eq("organization_id", organizationId)
    .eq("module_key", "employees")
    .maybeSingle();
  if (error) throw error;
  return data?.is_enabled === true;
}

async function requireAnyPermission(userId: string, organizationId: string, keys: string[]) {
  for (const key of keys) {
    if (await hasEffectivePermission(userId, organizationId, key)) return true;
  }
  return false;
}

async function getEmployee(organizationId: string, employeeId: string) {
  const { data, error } = await adminClient
    .from("employees")
    .select("id,organization_id,profile_id,role_id,full_name,cpf,phone,function_name,is_active,uniq_subscriber_id")
    .eq("organization_id", organizationId)
    .eq("id", employeeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getEntityForEmployee(organizationId: string, employeeId: string) {
  const { data, error } = await adminClient
    .from("entities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("legacy_employee_id", employeeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findProfileByUsername(username: string) {
  const { data, error } = await adminClient
    .from("profiles")
    .select("id,username")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadAccess(organizationId: string, employee: any) {
  if (!employee.profile_id) {
    return {
      enabled: false,
      profile_id: null,
      user_id: null,
      username: null,
      email: null,
      role_id: employee.role_id ?? null,
      uniq_subscriber_id: employee.uniq_subscriber_id ?? null,
      is_owner: false,
      restrict_by_ip: false,
      allowed_ips: [],
    };
  }

  const [{ data: profile, error: profileError }, { data: membership, error: membershipError }, authResult] = await Promise.all([
    adminClient.from("profiles").select("id,username,email,is_active,role_id,restrict_by_ip,allowed_ips").eq("id", employee.profile_id).maybeSingle(),
    adminClient.from("organization_members").select("id,role_id,status,is_owner").eq("organization_id", organizationId).eq("user_id", employee.profile_id).maybeSingle(),
    adminClient.auth.admin.getUserById(employee.profile_id),
  ]);
  if (profileError) throw profileError;
  if (membershipError) throw membershipError;
  if (authResult.error) throw authResult.error;

  return {
    enabled: profile?.is_active !== false && membership?.status === "active" && employee.is_active !== false,
    profile_id: employee.profile_id,
    user_id: employee.profile_id,
    username: profile?.username ?? null,
    email: authResult.data.user?.email ?? profile?.email ?? null,
    role_id: membership?.role_id ?? employee.role_id ?? profile?.role_id ?? null,
    uniq_subscriber_id: employee.uniq_subscriber_id ?? null,
    is_owner: membership?.is_owner === true,
    restrict_by_ip: profile?.restrict_by_ip === true,
    allowed_ips: Array.isArray(profile?.allowed_ips) ? profile.allowed_ips.map(String) : [],
  };
}

async function syncEmployeeAccessLinks(
  organizationId: string,
  employee: any,
  userId: string,
  roleId: string | null,
  uniqSubscriberId: string | null | undefined,
) {
  const employeePayload: Record<string, unknown> = {
    profile_id: userId,
    role_id: roleId,
    updated_at: new Date().toISOString(),
  };
  if (organizationId === PLATFORM_ORGANIZATION_ID && uniqSubscriberId !== undefined) {
    employeePayload.uniq_subscriber_id = uniqSubscriberId || null;
  }
  const { error: employeeError } = await adminClient
    .from("employees")
    .update(employeePayload)
    .eq("id", employee.id)
    .eq("organization_id", organizationId);
  if (employeeError) throw employeeError;

  const entity = await getEntityForEmployee(organizationId, employee.id);
  if (!entity) return;
  const detailPayload: Record<string, unknown> = {
    profile_id: userId,
    role_id: roleId,
    updated_at: new Date().toISOString(),
  };
  if (organizationId === PLATFORM_ORGANIZATION_ID && uniqSubscriberId !== undefined) {
    detailPayload.uniq_subscriber_id = uniqSubscriberId || null;
  }
  const { error: detailError } = await adminClient
    .from("entity_employee_details")
    .update(detailPayload)
    .eq("entity_id", entity.id);
  if (detailError) throw detailError;
}

async function restoreEmployeeAccessLinks(organizationId: string, employee: any) {
  const restoredEmployee: Record<string, unknown> = {
    profile_id: employee.profile_id ?? null,
    role_id: employee.role_id ?? null,
    is_active: employee.is_active !== false,
    updated_at: new Date().toISOString(),
  };
  if (organizationId === PLATFORM_ORGANIZATION_ID) {
    restoredEmployee.uniq_subscriber_id = employee.uniq_subscriber_id ?? null;
  }
  const { error: employeeError } = await adminClient
    .from("employees")
    .update(restoredEmployee)
    .eq("id", employee.id)
    .eq("organization_id", organizationId);
  if (employeeError) throw employeeError;

  const entity = await getEntityForEmployee(organizationId, employee.id);
  if (!entity) return;
  const restoredDetail: Record<string, unknown> = {
    profile_id: employee.profile_id ?? null,
    role_id: employee.role_id ?? null,
    updated_at: new Date().toISOString(),
  };
  if (organizationId === PLATFORM_ORGANIZATION_ID) {
    restoredDetail.uniq_subscriber_id = employee.uniq_subscriber_id ?? null;
  }
  const { error: detailError } = await adminClient
    .from("entity_employee_details")
    .update(restoredDetail)
    .eq("entity_id", entity.id);
  if (detailError) throw detailError;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const caller = await authenticatedUser(req);
  if (!caller) return json({ error: "Usuário não autenticado." }, 401);

  try {
    const body = await req.json();
    const action = String(body?.action ?? "");
    const organizationId = String(body?.organization_id ?? "").trim();
    const employeeId = String(body?.employee_id ?? "").trim();

    if (!uuidPattern.test(organizationId)) return json({ error: "Empresa inválida." }, 400);
    if (!(await employeeModuleEnabled(organizationId))) {
      return json({ error: "O módulo de funcionários não está disponível para esta empresa." }, 403);
    }

    if (action === "check_username_availability") {
      if (!await requireAnyPermission(caller.id, organizationId, ["employees.view", "employees.create", "employees.edit", "roles.view"])) {
        return json({ error: "Você não possui permissão para verificar este usuário." }, 403);
      }
      const username = normalizeUsername(body.username);
      if (!validUsername(username)) {
        return json({ error: "Use de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado." }, 400);
      }
      const existing = await findProfileByUsername(username);
      return json({
        success: true,
        username,
        available: !existing,
      });
    }

    if (!uuidPattern.test(employeeId)) return json({ error: "Funcionário inválido." }, 400);

    const employee = await getEmployee(organizationId, employeeId);
    if (!employee) return json({ error: "Funcionário não encontrado nesta empresa." }, 404);

    if (action === "get_employee_access") {
      if (!await requireAnyPermission(caller.id, organizationId, ["employees.view", "roles.view"])) {
        return json({ error: "Você não possui permissão para visualizar este acesso." }, 403);
      }
      return json({ success: true, access: await loadAccess(organizationId, employee) });
    }

    if (action === "check_username") {
      if (!await requireAnyPermission(caller.id, organizationId, ["employees.view", "employees.create", "employees.edit", "roles.view"])) {
        return json({ error: "Você não possui permissão para verificar este usuário." }, 403);
      }
      const username = normalizeUsername(body.username);
      if (!validUsername(username)) {
        return json({ error: "Use de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado." }, 400);
      }
      const existing = await findProfileByUsername(username);
      return json({
        success: true,
        username,
        available: !existing || existing.id === employee.profile_id,
      });
    }

    if (action !== "upsert_employee_access") {
      return json({ error: "Ação não suportada." }, 400);
    }

    const currentAccess = await loadAccess(organizationId, employee);
    const creatingAccess = !employee.profile_id;
    const requiredKey = creatingAccess ? "employees.create" : "employees.edit";
    if (!await hasEffectivePermission(caller.id, organizationId, requiredKey)) {
      return json({ error: "Você não possui permissão para alterar o acesso deste funcionário." }, 403);
    }

    const enabled = body.enabled === true;
    if (!creatingAccess && enabled !== currentAccess.enabled) {
      if (!await hasEffectivePermission(caller.id, organizationId, "employees.toggle_active")) {
        return json({ error: "Você não possui permissão para ativar ou desativar este acesso." }, 403);
      }
    }

    if (currentAccess.is_owner && (!enabled || (body.role_id && body.role_id !== currentAccess.role_id))) {
      return json({ error: "O acesso do proprietário não pode ser desativado nem ter sua função alterada por este fluxo." }, 400);
    }
    if (employee.profile_id === caller.id && !enabled) {
      return json({ error: "Você não pode desativar o próprio acesso." }, 400);
    }

    const roleId = body.role_id ? String(body.role_id) : currentAccess.role_id;
    if (enabled && !roleId) return json({ error: "Selecione uma função para habilitar o acesso." }, 400);

    if (roleId) {
      const { data: role, error: roleError } = await adminClient
        .from("roles")
        .select("id,is_active")
        .eq("id", roleId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (roleError) throw roleError;
      if (!role || role.is_active === false) return json({ error: "A função selecionada não está disponível para esta empresa." }, 400);
    }

    const username = normalizeUsername(body.username ?? currentAccess.username ?? "");
    const password = String(body.password ?? "");
    const restrictByIp = body.restrict_by_ip === undefined
      ? currentAccess.restrict_by_ip === true
      : body.restrict_by_ip === true;
    const allowedIps = body.allowed_ips === undefined
      ? (Array.isArray(currentAccess.allowed_ips) ? currentAccess.allowed_ips.map(String) : [])
      : Array.from(new Set(
        (Array.isArray(body.allowed_ips) ? body.allowed_ips : [])
          .map((value: unknown) => String(value ?? "").trim())
          .filter(Boolean),
      ));
    if (allowedIps.length > 20) {
      return json({ error: "Informe no máximo 20 endereços IP permitidos." }, 400);
    }
    if (restrictByIp && allowedIps.length === 0) {
      return json({ error: "Informe pelo menos um IP permitido para restringir o acesso." }, 400);
    }
    if (enabled && !validUsername(username)) {
      return json({ error: "Use de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado." }, 400);
    }
    if (enabled) {
      const usernameOwner = await findProfileByUsername(username);
      if (usernameOwner && usernameOwner.id !== employee.profile_id) {
        return json({ error: "Este usuário já está em uso." }, 409);
      }
    }
    if (creatingAccess && enabled && password.length < 8) {
      return json({ error: "A senha deve ter pelo menos 8 caracteres." }, 400);
    }
    if (!creatingAccess && password && password.length < 8) {
      return json({ error: "A nova senha deve ter pelo menos 8 caracteres." }, 400);
    }

    if (creatingAccess && !enabled) {
      return json({ success: true, access: currentAccess });
    }

    let userId = employee.profile_id as string | null;
    let createdUserId: string | null = null;
    let authEmail = currentAccess.email as string | null;

    try {
      if (!userId) {
        authEmail = internalAuthEmail(employee.id);
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
          email: authEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: employee.full_name, username },
        });
        if (authError || !authData.user) {
          return json({ error: authFailureMessage(authError, "create") }, 400);
        }
        userId = authData.user.id;
        createdUserId = userId;
        authEmail = authData.user.email ?? authEmail;
      } else if (password) {
        const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, { password });
        if (authUpdateError) return json({ error: authFailureMessage(authUpdateError, "update") }, 400);
      }

      const preservedActive = creatingAccess ? enabled : currentAccess.enabled;
      const { error: profileError } = await adminClient.from("profiles").upsert({
        id: userId,
        username,
        full_name: employee.full_name,
        email: authEmail || null,
        phone: employee.phone || null,
        role_id: roleId,
        is_active: preservedActive,
        restrict_by_ip: restrictByIp,
        allowed_ips: allowedIps,
        updated_at: new Date().toISOString(),
      });
      if (profileError) {
        if (String((profileError as any)?.code || "") === "23505") {
          return json({ error: "Este usuário já está em uso." }, 409);
        }
        throw profileError;
      }

      const membershipPayload = {
        organization_id: organizationId,
        user_id: userId,
        role_id: roleId,
        status: preservedActive ? "active" : "blocked",
        is_owner: currentAccess.is_owner === true,
        joined_at: new Date().toISOString(),
        created_by: caller.id,
        updated_at: new Date().toISOString(),
      };
      const { error: membershipError } = await adminClient
        .from("organization_members")
        .upsert(membershipPayload, { onConflict: "organization_id,user_id" });
      if (membershipError) throw membershipError;

      await syncEmployeeAccessLinks(
        organizationId,
        employee,
        userId,
        roleId,
        body.uniq_subscriber_id === undefined ? undefined : String(body.uniq_subscriber_id || "").trim() || null,
      );

      const { error: activeStateError } = await adminClient.rpc("admin_set_employee_active_state", {
        p_organization_id: organizationId,
        p_employee_id: employee.id,
        p_is_active: enabled,
      });
      if (activeStateError) throw activeStateError;

      const refreshedEmployee = {
        ...employee,
        profile_id: userId,
        role_id: roleId,
        is_active: enabled,
        uniq_subscriber_id: organizationId === PLATFORM_ORGANIZATION_ID && body.uniq_subscriber_id !== undefined
          ? String(body.uniq_subscriber_id || "").trim() || null
          : employee.uniq_subscriber_id,
      };
      return json({ success: true, access: await loadAccess(organizationId, refreshedEmployee) });
    } catch (error) {
      if (createdUserId) {
        try {
          await restoreEmployeeAccessLinks(organizationId, employee);
        } catch (restoreError) {
          console.error("[employee-access:rollback-links]", restoreError);
        }
        await adminClient.from("organization_members").delete().eq("user_id", createdUserId).eq("organization_id", organizationId);
        await adminClient.from("profiles").delete().eq("id", createdUserId);
        await adminClient.auth.admin.deleteUser(createdUserId);
      }
      throw error;
    }
  } catch (error) {
    console.error("[employee-access]", error);
    return json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o acesso do funcionário." }, 400);
  }
});
