using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using VietAnPickup;

var builder = WebApplication.CreateBuilder(args);

var conn = builder.Configuration.GetConnectionString("VietAn");
if (string.IsNullOrWhiteSpace(conn)) throw new InvalidOperationException("Thiếu ConnectionStrings:VietAn (xem appsettings.Development.example.json).");
var key = builder.Configuration["Jwt:SigningKey"];
if (string.IsNullOrWhiteSpace(key) || key.Length < 32) throw new InvalidOperationException("Jwt:SigningKey phải dài từ 32 ký tự (đặt trong appsettings.Development.json hoặc biến môi trường).");
const string issuer = "VietAnPickup";

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddDbContext<PickupDb>(o => o.UseSqlServer(conn, s => s.EnableRetryOnFailure()));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = issuer, ValidAudience = issuer, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
        ValidateIssuerSigningKey = true, ClockSkew = TimeSpan.FromMinutes(1),
    };
    o.MapInboundClaims = false;   // giữ claim "sub" nguyên tên
});
builder.Services.AddAuthorization();
builder.Services.AddSingleton<KienAi>();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
Auth.Map(app, key, issuer, app.Services.GetRequiredService<TimeProvider>());
Bookings.Map(app);
Pickups.Map(app);
Images.Map(app);
AppLog.Map(app);
Reweight.Map(app);
KienAi.Map(app);
app.Run();

public partial class Program;
