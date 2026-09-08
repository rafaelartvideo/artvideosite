import { createClient } from "npm:@supabase/supabase-js@2";

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

const allowedOriginsEnv = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const allowedOrigins = allowedOriginsEnv === "*"
  ? null
  : allowedOriginsEnv.split(",").map((value) => value.trim());

function resolveOrigin(requestOrigin: string | null) {
  if (!allowedOrigins) return "*";
  if (!requestOrigin) return allowedOrigins[0] ?? "*";
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0] ?? "*";
}

function corsHeaders(request: Request) {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(request.headers.get("Origin")),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

function respond(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

function normalizeDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

async function hasRolePermission(roleId: string | null, permissionKey: string) {
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

async function requirePlatformManager(callerUserId: string) {
  const { data: membership, error } = await adminClient
    .from("organization_members")
    .select("role_id")
    .eq("organization_id", PLATFORM_ORGANIZATION_ID)
    .eq("user_id", callerUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return hasRolePermission(membership?.role_id ?? null, "organizations.members.manage");
}

async function getPartnerOrganization(organizationId: string) {
  const { data, error } = await adminClient
    .from("organizations")
    .select("id,name,status,organization_type")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.id === PLATFORM_ORGANIZATION_ID || data.organization_type !== "partner") return null;
  return data;
}

async function getActiveRole(roleId: string) {
  const { data, error } = await adminClient
    .from("roles")
    .select("id,name,is_active")
    .eq("id", roleId)
    .maybeSingle();
  if (error) throw error;
  return data?.is_active === false ? null : data;
}

async function findAuthUserByEmail(email: string) {
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.trim().toLowerCase() === email);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function listPartnerUsers(organizationId: string) {
  const [{ data: members, error: membersError }, { data: employees, error: employeesError }, authUsersResult] = await Promise.all([
    adminClient
      .from("organization_members")
      .select("id,organization_id,user_id,role_id,status,is_owner,joined_at,profile:profiles!user_id(id,full_name,is_active),role:roles(id,name)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    adminClient
      .from("employees")
      .select("id,profile_id,full_name,cpf,phone,function_name,role_id,is_active")
      .eq("organization_id", organizationId),
    adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (membersError) throw membersError;
  if (employeesError) throw employeesError;
  if (authUsersResult.error) throw authUsersResult.error;

  const employeeByProfile = new Map((employees ?? []).map((employee: any) => [employee.profile_id, employee]));
  const emailByUser = new Map(authUsersResult.data.users.map((authUser) => [authUser.id, authUser.email ?? null]));

  return (members ?? []).map((member: any) => {
    const employee = employeeByProfile.get(member.user_id) as any;
    return {
      membership_id: member.id,
      organization_id: member.organization_id,
      user_id: member.user_id,
      role_id: member.role_id,
      role_name: member.role?.name ?? null,
      status: member.status,
      is_owner: member.is_owner === true,
      joined_at: member.joined_at,
      full_name: employee?.full_name ?? member.profile?.full_name ?? "",
      email: emailByUser.get(member.user_id) ?? null,
      cpf: employee?.cpf ?? "",
      phone: employee?.phone ?? "",
      function_name: employee?.function_name ?? member.role?.name ?? "",
      employee_id: employee?.id ?? null,
      employee_active: employee?.is_active !== false,
      profile_active: member.profile?.is_active !== false,
    };
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return respond(request, { error: "Método não permitido." }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return respond(request, { error: "Usuário não autenticado." }, 401);

    const { data: callerData, error: callerError } = await authClient.auth.getUser(token);
    if (callerError || !callerData.user) return respond(request, { error: "Sessão inválida ou expirada." }, 401);

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("id,is_active")
      .eq("id", callerData.user.id)
      .maybeSingle();
    if (callerProfileError || !callerProfile?.is_active) return respond(request, { error: "Perfil do usuário não está ativo." }, 403);

    if (!(await requirePlatformManager(callerData.user.id))) {
      return respond(request, { error: "Você não possui permissão para gerenciar usuários de empresas parceiras." }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "list_partner_roles") {
      const { data, error } = await adminClient
        .from("roles")
        .select("id,name,description,is_system,is_active,sort_order")
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return respond(request, { success: true, roles: data ?? [] });
    }

    const organizationId = String(body?.organization_id ?? "").trim();
    if (!isUuid(organizationId)) return respond(request, { error: "Empresa não informada ou inválida." }, 400);

    const organization = await getPartnerOrganization(organizationId);
    if (!organization) return respond(request, { error: "Empresa parceira não encontrada." }, 404);

    if (action === "list_partner_users") {
      const users = await listPartnerUsers(organizationId);
      return respond(request, { success: true, organization, users });
    }

    if (action !== "create_partner_user" && action !== "update_partner_user") {
      return respond(request, { error: "Ação não suportada." }, 400);
    }

    const roleId = String(body?.role_id ?? "").trim();
    const fullName = String(body?.full_name ?? "").trim();
    const cpf = normalizeDigits(body?.cpf);
    const phone = String(body?.phone ?? "").trim() || null;
    const functionName = String(body?.function_name ?? "").trim();
    const isOwner = body?.is_owner === true;
    const isActive = body?.is_active !== false;

    if (!isUuid(roleId) || !fullName || !cpf) {
      return respond(request, { error: "Nome, CPF e função são obrigatórios." }, 400);
    }

    const role = await getActiveRole(roleId);
    if (!role) return respond(request, { error: "A função selecionada não está disponível." }, 400);

    if (action === "create_partner_user") {
      if (organization.status !== "active") {
        return respond(request, { error: "Ative a empresa antes de cadastrar novos usuários." }, 400);
      }

      const email = normalizeEmail(body?.email);
      const password = String(body?.password ?? "");
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return respond(request, { error: "Informe um e-mail válido." }, 400);
      }

      let authUser = await findAuthUserByEmail(email);
      let createdAuthUserId: string | null = null;
      let createdMembership = false;

      try {
        if (!authUser) {
          if (password.length < 8) return respond(request, { error: "A senha temporária deve ter pelo menos 8 caracteres." }, 400);
          const { data: createdAuth, error: createAuthError } = await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });
          if (createAuthError || !createdAuth.user) throw createAuthError ?? new Error("Não foi possível criar o login.");
          authUser = createdAuth.user;
          createdAuthUserId = authUser.id;
        }

        const { data: existingMembership, error: membershipLookupError } = await adminClient
          .from("organization_members")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("user_id", authUser.id)
          .maybeSingle();
        if (membershipLookupError) throw membershipLookupError;
        if (existingMembership) return respond(request, { error: "Este usuário já pertence à empresa selecionada." }, 400);

        const { data: existingProfile, error: profileLookupError } = await adminClient
          .from("profiles")
          .select("id,is_active,role_id")
          .eq("id", authUser.id)
          .maybeSingle();
        if (profileLookupError) throw profileLookupError;
        if (existingProfile?.is_active === false) {
          return respond(request, { error: "O usuário já existe, mas o perfil global está inativo." }, 400);
        }

        if (!existingProfile) {
          const { error: profileInsertError } = await adminClient.from("profiles").insert({
            id: authUser.id,
            full_name: fullName,
            role_id: roleId,
            is_active: true,
          });
          if (profileInsertError) throw profileInsertError;
        } else {
          const { error: profileUpdateError } = await adminClient
            .from("profiles")
            .update({ full_name: fullName })
            .eq("id", authUser.id);
          if (profileUpdateError) throw profileUpdateError;
        }

        const { error: membershipInsertError } = await adminClient.from("organization_members").insert({
          organization_id: organizationId,
          user_id: authUser.id,
          role_id: roleId,
          status: "active",
          is_owner: isOwner,
          joined_at: new Date().toISOString(),
          created_by: callerData.user.id,
        });
        if (membershipInsertError) throw membershipInsertError;
        createdMembership = true;

        const { data: existingEmployee, error: employeeLookupError } = await adminClient
          .from("employees")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("profile_id", authUser.id)
          .maybeSingle();
        if (employeeLookupError) throw employeeLookupError;

        const employeePayload = {
          full_name: fullName,
          cpf,
          phone,
          function_name: functionName || role.name,
          role_id: roleId,
          is_active: true,
        };
        if (existingEmployee) {
          const { error } = await adminClient.from("employees").update(employeePayload).eq("id", existingEmployee.id);
          if (error) throw error;
        } else {
          const { error } = await adminClient.from("employees").insert({
            organization_id: organizationId,
            profile_id: authUser.id,
            ...employeePayload,
          });
          if (error) throw error;
        }

        return respond(request, {
          success: true,
          user_id: authUser.id,
          reused_existing_login: createdAuthUserId === null,
        });
      } catch (error) {
        if (authUser && createdMembership) {
          await adminClient.from("organization_members").delete().eq("organization_id", organizationId).eq("user_id", authUser.id);
          await adminClient.from("employees").delete().eq("organization_id", organizationId).eq("profile_id", authUser.id);
        }
        if (createdAuthUserId) {
          await adminClient.from("profiles").delete().eq("id", createdAuthUserId);
          await adminClient.auth.admin.deleteUser(createdAuthUserId);
        }
        throw error;
      }
    }

    const userId = String(body?.user_id ?? "").trim();
    if (!isUuid(userId)) return respond(request, { error: "Usuário não informado." }, 400);

    const { data: membership, error: membershipError } = await adminClient
      .from("organization_members")
      .select("id,is_owner")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return respond(request, { error: "Usuário não pertence à empresa selecionada." }, 404);

    const { error: membershipUpdateError } = await adminClient
      .from("organization_members")
      .update({
        role_id: roleId,
        status: isActive ? "active" : "blocked",
        is_owner: isOwner,
        updated_at: new Date().toISOString(),
      })
      .eq("id", membership.id);
    if (membershipUpdateError) throw membershipUpdateError;

    const employeePayload = {
      full_name: fullName,
      cpf,
      phone,
      function_name: functionName || role.name,
      role_id: roleId,
      is_active: isActive,
    };
    const { data: employee, error: employeeLookupError } = await adminClient
      .from("employees")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("profile_id", userId)
      .maybeSingle();
    if (employeeLookupError) throw employeeLookupError;

    if (employee) {
      const { error } = await adminClient.from("employees").update(employeePayload).eq("id", employee.id);
      if (error) throw error;
    } else {
      const { error } = await adminClient.from("employees").insert({
        organization_id: organizationId,
        profile_id: userId,
        ...employeePayload,
      });
      if (error) throw error;
    }

    const { error: profileNameError } = await adminClient
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", userId);
    if (profileNameError) throw profileNameError;

    const { count: membershipCount, error: membershipCountError } = await adminClient
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (membershipCountError) throw membershipCountError;
    if ((membershipCount ?? 0) <= 1) {
      const { error } = await adminClient.from("profiles").update({ role_id: roleId }).eq("id", userId);
      if (error) throw error;
    }

    return respond(request, { success: true, user_id: userId });
  } catch (error) {
    console.error("[PARTNER USERS]", error);
    return respond(request, {
      error: error instanceof Error ? error.message : "Não foi possível executar a operação.",
    }, 400);
  }
});
