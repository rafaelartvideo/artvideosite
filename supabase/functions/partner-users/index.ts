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

function fail(
  request: Request,
  error: string,
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
) {
  return respond(request, { success: false, error, code, ...extra }, status);
}

function unexpectedFailure(request: Request, error: any) {
  const databaseCode = String(error?.code ?? "");
  const details = String(error?.details ?? "");

  if (databaseCode === "23505") {
    return fail(
      request,
      "Já existe um cadastro com estes dados.",
      409,
      "duplicate_data",
    );
  }
  if (databaseCode === "23503") {
    return fail(
      request,
      "Um dos vínculos informados não existe mais. Atualize a página e tente novamente.",
      409,
      "invalid_reference",
    );
  }
  if (databaseCode === "23514" || databaseCode === "22P02") {
    return fail(
      request,
      "Há um dado inválido no cadastro. Revise os campos informados.",
      400,
      "invalid_data",
    );
  }
  if (databaseCode === "42501") {
    return fail(
      request,
      "Você não possui permissão para executar esta operação.",
      403,
      "permission_denied",
    );
  }

  return fail(
    request,
    "O servidor não conseguiu concluir a operação. Tente novamente.",
    500,
    "internal_error",
    details ? { details } : {},
  );
}

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}

function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function validUsername(value: string) {
  return usernamePattern.test(value);
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function validOptionalEmail(value: string) {
  return value === "" || emailPattern.test(value);
}

function normalizeDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function internalAuthEmail() {
  return `partner-${crypto.randomUUID()}@auth.artvideo.app`;
}

function authFailureMessage(error: any) {
  const code = String(error?.code ?? "").toLowerCase();
  const message = String(error?.message ?? "").toLowerCase();
  if (code === "weak_password" || code.includes("password") || message.includes("password")) {
    return "A senha informada não atende aos requisitos de segurança.";
  }
  if (code.includes("email") || message.includes("email") || message.includes("already been registered")) {
    return "Não foi possível criar o identificador interno deste usuário.";
  }
  return "Não foi possível salvar o usuário de acesso.";
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

async function getActiveRole(organizationId: string, roleId: string) {
  const { data, error } = await adminClient
    .from("roles")
    .select("id,name,is_active,organization_id")
    .eq("id", roleId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return data?.is_active === false ? null : data;
}

async function findProfileByUsername(username: string) {
  const { data, error } = await adminClient
    .from("profiles")
    .select("id,username,is_active,role_id")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function listPartnerUsers(organizationId: string) {
  const [{ data: members, error: membersError }, { data: employees, error: employeesError }] = await Promise.all([
    adminClient
      .from("organization_members")
      .select("id,organization_id,user_id,role_id,status,is_owner,joined_at,profile:profiles!organization_members_user_id_fkey(id,full_name,username,email,is_active),role:roles(id,name)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    adminClient
      .from("employees")
      .select("id,profile_id,full_name,cpf,phone,function_name,role_id,is_active")
      .eq("organization_id", organizationId),
  ]);
  if (membersError) throw membersError;
  if (employeesError) throw employeesError;

  const employeeByProfile = new Map((employees ?? []).map((employee: any) => [employee.profile_id, employee]));

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
      username: member.profile?.username ?? "",
      email: member.profile?.email ?? "",
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
  if (request.method !== "POST") return fail(request, "Método não permitido.", 405, "method_not_allowed");

  try {
    const authorization = request.headers.get("Authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return fail(request, "Usuário não autenticado.", 401, "unauthenticated");

    const { data: callerData, error: callerError } = await authClient.auth.getUser(token);
    if (callerError || !callerData.user) return fail(request, "Sessão inválida ou expirada.", 401, "invalid_session");

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("id,is_active")
      .eq("id", callerData.user.id)
      .maybeSingle();
    if (callerProfileError || !callerProfile?.is_active) {
      return fail(request, "Perfil do usuário não está ativo.", 403, "inactive_profile");
    }

    if (!(await requirePlatformManager(callerData.user.id))) {
      return fail(request, "Você não possui permissão para gerenciar usuários de empresas parceiras.", 403, "forbidden");
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "list_partner_roles") {
      const roleOrganizationId = String(body?.organization_id ?? "").trim();
      if (!isUuid(roleOrganizationId)) {
        return fail(request, "Empresa não informada ou inválida.", 400, "invalid_organization");
      }
      const roleOrganization = await getPartnerOrganization(roleOrganizationId);
      if (!roleOrganization) {
        return fail(request, "Empresa parceira não encontrada.", 404, "organization_not_found");
      }

      const { data, error } = await adminClient
        .from("roles")
        .select("id,name,description,is_system,is_active,sort_order,organization_id")
        .eq("organization_id", roleOrganizationId)
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return respond(request, { success: true, roles: data ?? [] });
    }

    const organizationId = String(body?.organization_id ?? "").trim();
    if (!isUuid(organizationId)) return fail(request, "Empresa não informada ou inválida.", 400, "invalid_organization");

    const organization = await getPartnerOrganization(organizationId);
    if (!organization) return fail(request, "Empresa parceira não encontrada.", 404, "organization_not_found");

    if (action === "list_partner_users") {
      const users = await listPartnerUsers(organizationId);
      return respond(request, { success: true, organization, users });
    }

    if (action !== "create_partner_user" && action !== "update_partner_user") {
      return fail(request, "Ação não suportada.", 400, "unsupported_action");
    }

    const roleId = String(body?.role_id ?? "").trim();
    const fullName = String(body?.full_name ?? "").trim();
    const cpf = normalizeDigits(body?.cpf);
    const phone = String(body?.phone ?? "").trim() || null;
    const email = normalizeEmail(body?.email);
    const functionName = String(body?.function_name ?? "").trim();
    const isOwner = body?.is_owner === true;
    const isActive = body?.is_active !== false;

    if (!isUuid(roleId) || !fullName || !cpf) {
      return fail(request, "Nome, CPF e função são obrigatórios.", 400, "required_fields");
    }
    if (!validOptionalEmail(email)) {
      return fail(request, "O e-mail informado não é válido.", 400, "invalid_email");
    }

    const role = await getActiveRole(organizationId, roleId);
    if (!role) return fail(request, "A função selecionada não está disponível.", 400, "invalid_role");

    if (action === "create_partner_user") {
      if (organization.status !== "active") {
        return fail(request, "Ative a empresa antes de cadastrar novos usuários.", 400, "company_inactive");
      }

      const username = normalizeUsername(body?.username);
      const password = String(body?.password ?? "");
      if (!validUsername(username)) {
        return fail(request, "Use de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.", 400, "invalid_username");
      }
      if (password.length < 8) {
        return fail(request, "A senha deve ter pelo menos 8 caracteres.", 400, "weak_password");
      }

      const existingProfile = await findProfileByUsername(username);
      if (existingProfile) {
        return fail(request, "Este usuário já está em uso. Escolha outro usuário.", 409, "username_already_exists");
      }

      const { data: existingCpfEmployee, error: existingCpfError } = await adminClient
        .from("employees")
        .select("id,full_name,profile_id,is_active")
        .eq("organization_id", organizationId)
        .eq("cpf", cpf)
        .maybeSingle();
      if (existingCpfError) throw existingCpfError;
      if (existingCpfEmployee) {
        return fail(
          request,
          `Este CPF já está cadastrado nesta empresa para ${existingCpfEmployee.full_name || "outro funcionário"}.`,
          409,
          "cpf_already_exists",
          { employee_id: existingCpfEmployee.id },
        );
      }

      let createdAuthUserId: string | null = null;
      let createdMembership = false;

      try {
        const authEmail = internalAuthEmail();
        const { data: createdAuth, error: createAuthError } = await adminClient.auth.admin.createUser({
          email: authEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, username },
        });
        if (createAuthError || !createdAuth.user) {
          return fail(request, authFailureMessage(createAuthError), 400, "auth_create_failed");
        }

        const authUser = createdAuth.user;
        createdAuthUserId = authUser.id;

        const { error: profileUpsertError } = await adminClient.from("profiles").upsert({
          id: authUser.id,
          username,
          full_name: fullName,
          email: email || null,
          phone,
          role_id: roleId,
          is_active: true,
          updated_at: new Date().toISOString(),
        });
        if (profileUpsertError) {
          if (String((profileUpsertError as any)?.code ?? "") === "23505") {
            await adminClient.from("profiles").delete().eq("id", authUser.id);
            await adminClient.auth.admin.deleteUser(authUser.id);
            createdAuthUserId = null;
            return fail(request, "Este usuário já está em uso.", 409, "username_already_exists");
          }
          throw profileUpsertError;
        }

        const { error: membershipInsertError } = await adminClient.from("organization_members").insert({
          organization_id: organizationId,
          user_id: authUser.id,
          role_id: roleId,
          status: isActive ? "active" : "blocked",
          is_owner: isOwner,
          joined_at: new Date().toISOString(),
          created_by: callerData.user.id,
        });
        if (membershipInsertError) throw membershipInsertError;
        createdMembership = true;

        const { error: employeeInsertError } = await adminClient.from("employees").insert({
          organization_id: organizationId,
          profile_id: authUser.id,
          full_name: fullName,
          cpf,
          phone,
          function_name: functionName || role.name,
          role_id: roleId,
          is_active: isActive,
        });
        if (employeeInsertError) throw employeeInsertError;

        return respond(request, {
          success: true,
          user_id: authUser.id,
          username,
          email: email || null,
          reused_existing_login: false,
        });
      } catch (error) {
        if (createdAuthUserId && createdMembership) {
          await adminClient.from("employees").delete().eq("organization_id", organizationId).eq("profile_id", createdAuthUserId);
          await adminClient.from("organization_members").delete().eq("organization_id", organizationId).eq("user_id", createdAuthUserId);
        }
        if (createdAuthUserId) {
          await adminClient.from("profiles").delete().eq("id", createdAuthUserId);
          await adminClient.auth.admin.deleteUser(createdAuthUserId);
        }
        throw error;
      }
    }

    const userId = String(body?.user_id ?? "").trim();
    if (!isUuid(userId)) return fail(request, "Usuário não informado.", 400, "invalid_user");

    const { data: membership, error: membershipError } = await adminClient
      .from("organization_members")
      .select("id,is_owner")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return fail(request, "Usuário não pertence à empresa selecionada.", 404, "user_not_in_organization");

    const { data: conflictingCpfEmployee, error: conflictingCpfError } = await adminClient
      .from("employees")
      .select("id,full_name,profile_id")
      .eq("organization_id", organizationId)
      .eq("cpf", cpf)
      .neq("profile_id", userId)
      .maybeSingle();
    if (conflictingCpfError) throw conflictingCpfError;
    if (conflictingCpfEmployee) {
      return fail(
        request,
        `Este CPF já está cadastrado nesta empresa para ${conflictingCpfEmployee.full_name || "outro funcionário"}.`,
        409,
        "cpf_already_exists",
        { employee_id: conflictingCpfEmployee.id },
      );
    }

    const authPayload: Record<string, unknown> = {
      user_metadata: { full_name: fullName },
    };
    const newPassword = String(body?.password ?? "");
    if (newPassword) {
      if (newPassword.length < 8) {
        return fail(request, "A nova senha deve ter pelo menos 8 caracteres.", 400, "weak_password");
      }
      authPayload.password = newPassword;
    }

    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, authPayload);
    if (authUpdateError) return fail(request, authFailureMessage(authUpdateError), 400, "auth_update_failed");

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

    const { count: membershipCount, error: membershipCountError } = await adminClient
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (membershipCountError) throw membershipCountError;

    const profilePayload: Record<string, unknown> = {
      email: email || null,
      updated_at: new Date().toISOString(),
    };
    if ((membershipCount ?? 0) <= 1) {
      profilePayload.full_name = fullName;
      profilePayload.role_id = roleId;
    }

    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update(profilePayload)
      .eq("id", userId);
    if (profileUpdateError) throw profileUpdateError;

    return respond(request, { success: true, user_id: userId, email: email || null });
  } catch (error) {
    console.error("[PARTNER USERS]", error);
    return unexpectedFailure(request, error);
  }
});