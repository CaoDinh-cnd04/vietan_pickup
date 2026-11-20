using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace VietAnPickup;

public sealed record LoginRequest(string? UserName, string? Password);

/// <summary>
/// Đăng nhập bằng bảng USERS của CRM, giữ nguyên luật legacy (ADR-001 bên CRM): chặn ngoài giờ (TBaseCode) → STATUS=ACTIVE →
/// mật khẩu bcrypt, nếu chưa có thì MD5-lossy không salt (Md5AddSecret) rồi plaintext legacy. KHÔNG ghi gì ngược vào USERS.
/// </summary>
public static class Auth
{
    /// <summary>Port nguyên văn Md5AddSecret: UTF8.GetString(MD5(pwd)) — decode LOSSY có chủ đích, USER_PASSWORD ghi đúng chuỗi này.</summary>
    internal static string Md5AddSecret(string password) => Encoding.UTF8.GetString(MD5.HashData(Encoding.UTF8.GetBytes(password)));

    internal static bool VerifyPassword(string password, User u)
    {
        if (string.IsNullOrEmpty(password)) return false;
        if (!string.IsNullOrEmpty(u.PasswordBcrypt)) return BCrypt.Net.BCrypt.Verify(password, u.PasswordBcrypt);
        return u.UserPassword is { Length: > 0 } stored && (Md5AddSecret(password) == stored || password == stored);
    }

    /// <summary>Chặn user trong danh sách Users_Chan trong khung giờ Thoi_Gian_Chan (mặc định 18-7) — parity Login.cs:216-229.</summary>
    internal static bool BlockedOutsideHours(string? range, string? users, string loginId, DateTime now)
    {
        var p = (string.IsNullOrEmpty(range) ? "18-7" : range).Split('-');
        int start = int.TryParse(p.ElementAtOrDefault(0), out var s) ? s : 0, end = int.TryParse(p.ElementAtOrDefault(1), out var e) ? e : 0;
        var inList = ("," + (users ?? "") + ",").ToLowerInvariant().Contains("," + loginId.ToLowerInvariant() + ",");
        return (now.Hour >= start || now.Hour < end) && inList;
    }

    internal static string StaffName(User? u)
    {
        if (u is null) return "";
        var f = u.FirstName?.Trim() ?? ""; var l = u.LastName?.Trim() ?? "";
        var n = f == l ? f : $"{f} {l}".Trim();   // FIRST_NAME = LAST_NAME (dữ liệu legacy) thì không lặp
        return n.Length > 0 ? n : u.UserName ?? "";
    }

    public static void Map(IEndpointRouteBuilder app, string signingKey, string issuer, TimeProvider clock)
    {
        app.MapPost("/api/auth/login", async (LoginRequest r, PickupDb db, CancellationToken ct) =>
        {
            var loginId = (r.UserName ?? "").Trim().ToLowerInvariant();
            if (loginId.Length == 0) return Results.Json(new { error = "LoginID Incorrect" }, statusCode: 401);
            var range = await db.BaseCodes.Where(b => b.Option1 == "Thoi_Gian_Chan").Select(b => b.Option2).FirstOrDefaultAsync(ct);
            var users = await db.BaseCodes.Where(b => b.Option1 == "Users_Chan").Select(b => b.Option2).FirstOrDefaultAsync(ct);
            if (BlockedOutsideHours(range, users, loginId, clock.GetLocalNow().DateTime)) return Results.Json(new { error = "Ngoài giờ làm việc!" }, statusCode: 401);

            var u = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.UserName == loginId, ct);
            if (u is null) return Results.Json(new { error = "LoginID Incorrect" }, statusCode: 401);
            if (!string.Equals(u.Status?.Trim(), "ACTIVE", StringComparison.OrdinalIgnoreCase)) return Results.Json(new { error = "User an active" }, statusCode: 401);   // giữ nguyên message legacy
            if (!VerifyPassword(r.Password ?? "", u)) return Results.Json(new { error = "Password Incorrect" }, statusCode: 401);

            var expires = clock.GetUtcNow().UtcDateTime.AddHours(12);
            var token = new JwtSecurityToken(issuer, issuer,
                [new Claim(JwtRegisteredClaimNames.Sub, u.Id.ToString()), new Claim("user_name", u.UserName ?? ""), new Claim("full_name", StaffName(u))],
                expires: expires, signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)), SecurityAlgorithms.HmacSha256));
            return Results.Ok(new { accessToken = new JwtSecurityTokenHandler().WriteToken(token), expiresAt = expires, userName = u.UserName, fullName = StaffName(u) });
        }).AllowAnonymous();
    }

    /// <summary>Id nhân viên đang đăng nhập (claim sub).</summary>
    internal static int UserId(HttpContext http) => int.TryParse(http.User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? http.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;
}
