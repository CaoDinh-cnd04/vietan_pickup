using System.Text;
using System.Text.Json;

namespace VietAnPickup;

/// <summary>Gợi ý của AI cho 1 kiện. Null = không xác định được từ ảnh. NguonKichThuoc: "thuoc" (đọc thước/nhãn) · "uoc_luong" · "khong_ro".</summary>
public sealed record KienGoiY(int? Dai, int? Rong, int? Cao, decimal? TrongLuong, string? Loai, string NguonKichThuoc, string GhiChu);

/// <summary>
/// Phân tích ảnh kiện bằng Gemini để ĐIỀN SẴN ô dài/rộng/cao/cân — người kho vẫn kiểm và bấm lưu.
/// Cân chỉ lấy khi đọc được số trên màn hình cân trong ảnh (ảnh không cho biết khối lượng); kích thước đọc thước/nhãn nếu có, không thì ước lượng.
/// Khoá: cấu hình Gemini:ApiKey hoặc biến môi trường GEMINI_API_KEY. Không có khoá ⇒ tính năng tắt (API trả 503).
/// </summary>
public sealed class KienAi(IConfiguration cfg, ILogger<KienAi> log)
{
    private const string Model = "gemini-3.5-flash";
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(60) };
    private readonly string? _key = (cfg["Gemini:ApiKey"] ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY")) is { Length: > 0 } k ? k : null;

    public bool Enabled => _key is not null;

    private const string Prompt = """
        Ảnh chụp một kiện hàng tại kho chuyển phát (ảnh có thể bị xoay ngang/ngược — hãy tự xoay để đọc). Điền số đo cho kiện CHÍNH (kiện chiếm phần lớn ảnh, ở giữa):
        Nhân viên kho thường GHI TAY bằng bút lông lên thùng — ưu tiên đọc các số này:
        - Kích thước: 3 số cách nhau bởi "/" hoặc "x", theo thứ tự dài/rộng/cao (cm). Vd "32/28/28", "41/27/24", "62/42/42", "40x36x36", "58x50x40".
          Thường là dòng số đầu tiên, nét to. Đọc được ⇒ nguon_kich_thuoc = "thuoc" và giữ đúng thứ tự đã ghi.
        - Cân (kg): số thập phân dùng DẤU PHẨY, vd "Cân: 18,52" ⇒ 18.52; hoặc là phần cuối của dòng "tên khách/mã nước/cân" như "P.Anh/AU/19,91" ⇒ 19.91, "P.Anh/AU/22,86" ⇒ 22.86.
        BỎ QUA: số bill/mã vạch, số điện thoại, địa chỉ, mã bưu chính, ngày tháng, "Total: n pcs", số lượng hàng (vd "25 miến"), chữ in sẵn của nhà sản xuất thùng (vd "26,3 kg" in trên vỏ thùng tái sử dụng), số trên kiện khác phía sau.
        Quy tắc điền:
        - trong_luong (kg): CHỈ lấy khi số đó rõ ràng là cân — có chữ "Cân"/"kg" đi kèm, hoặc là số thập phân có dấu phẩy ở cuối dòng "tên/mã nước/số" như trên — hoặc đọc từ màn hình/kim cân trong ảnh.
          Thùng chỉ có tên khách, nơi đến, ghi chú (vd "C.Quanh/Thảo/EU", "Phú") mà không có số cân ⇒ null. Không chắc ⇒ null — tuyệt đối không đoán khối lượng.
        - dai, rong, cao (cm, số nguyên): ghi tay/thước/nhãn ⇒ "thuoc"; nếu không có, ước lượng theo vật tham chiếu quen thuộc (giấy A4, gạch lát nền ~60cm, bàn cân, tay người…) ⇒ "uoc_luong" (dài ≥ rộng); không đủ cơ sở ⇒ null và "khong_ro".
        - loai: "CARTON" (thùng cứng) hoặc "TUI" (túi/bao mềm).
        - ghi_chu: 1 câu tiếng Việt ngắn nói con số lấy từ đâu (vd "Kích thước đọc từ chữ ghi tay 32/28/28; cân ghi tay 18,52 kg").
        """;

    private static readonly Dictionary<string, JsonElement> Schema = new()
    {
        ["type"] = JsonSerializer.SerializeToElement("object"),
        ["additionalProperties"] = JsonSerializer.SerializeToElement(false),
        ["required"] = JsonSerializer.SerializeToElement(new[] { "dai", "rong", "cao", "trong_luong", "loai", "nguon_kich_thuoc", "ghi_chu" }),
        ["properties"] = JsonSerializer.SerializeToElement(new Dictionary<string, object>
        {
            ["dai"] = new { type = new[] { "integer", "null" } },
            ["rong"] = new { type = new[] { "integer", "null" } },
            ["cao"] = new { type = new[] { "integer", "null" } },
            ["trong_luong"] = new { type = new[] { "number", "null" } },
            ["loai"] = new { type = "string", @enum = new[] { "CARTON", "TUI" } },
            ["nguon_kich_thuoc"] = new { type = "string", @enum = new[] { "thuoc", "uoc_luong", "khong_ro" } },
            ["ghi_chu"] = new { type = "string" },
        }),
    };

    public async Task<KienGoiY?> AnalyzeAsync(byte[] image, string mediaType, CancellationToken ct)
    {
        if (_key is null) return null;
        var body = new
        {
            contents = new[] { new { parts = new object[] { new { inlineData = new { mimeType = mediaType, data = Convert.ToBase64String(image) } }, new { text = Prompt } } } },
            generationConfig = new { responseMimeType = "application/json", responseJsonSchema = Schema, thinkingConfig = new { thinkingLevel = "medium" } },   // medium: low đọc sai chữ ghi tay xấu (12→42, bỏ sót số)
        };
        using var msg = new HttpRequestMessage(HttpMethod.Post, $"https://generativelanguage.googleapis.com/v1beta/models/{Model}:generateContent")
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
        };
        msg.Headers.Add("x-goog-api-key", _key);
        using var resp = await Http.SendAsync(msg, ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode) throw new HttpRequestException($"Gemini {(int)resp.StatusCode}: {json}");

        using var outer = JsonDocument.Parse(json);
        if (!outer.RootElement.TryGetProperty("candidates", out var cands) || cands.GetArrayLength() == 0
            || cands[0].GetProperty("finishReason").GetString() != "STOP"
            || !cands[0].TryGetProperty("content", out var content))
        { log.LogWarning("AI từ chối/không trả kết quả phân tích ảnh kiện: {Json}", json); return null; }
        var text = string.Concat(content.GetProperty("parts").EnumerateArray()
            .Where(p => !(p.TryGetProperty("thought", out var th) && th.GetBoolean()))
            .Select(p => p.TryGetProperty("text", out var t) ? t.GetString() : ""));
        using var doc = JsonDocument.Parse(text);
        var r = doc.RootElement;
        static int? I(JsonElement e) => e.ValueKind == JsonValueKind.Number && e.TryGetInt32(out var v) && v is >= 1 and <= 999 ? v : null;
        decimal? kg = r.GetProperty("trong_luong") is { ValueKind: JsonValueKind.Number } w && w.GetDecimal() is >= 0 and <= 99999 and var k ? Math.Round(k, 2) : null;
        return new KienGoiY(I(r.GetProperty("dai")), I(r.GetProperty("rong")), I(r.GetProperty("cao")), kg,
            r.GetProperty("loai").GetString(), r.GetProperty("nguon_kich_thuoc").GetString() ?? "khong_ro", r.GetProperty("ghi_chu").GetString() ?? "");
    }

    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapPost("/api/ai/kien-photo", async (HttpRequest req, KienAi ai, CancellationToken ct) =>
        {
            if (!ai.Enabled) return Results.Json(new { error = "Chưa cấu hình khoá AI (Gemini:ApiKey)." }, statusCode: 503);
            if (!req.HasFormContentType) return Results.BadRequest(new { error = "Cần gửi multipart/form-data." });
            var file = (await req.ReadFormAsync(ct)).Files.GetFile("photo");
            if (file is null || file.Length is 0 or > Bookings.MaxPhotoBytes) return Results.BadRequest(new { error = "Thiếu ảnh hoặc ảnh quá 8MB." });
            using var ms = new MemoryStream((int)file.Length);
            await file.CopyToAsync(ms, ct);
            var bytes = ms.ToArray();
            if (Bookings.DetectType(bytes) is not { } type) return Results.BadRequest(new { error = "Chỉ nhận ảnh jpg, png, webp." });
            try
            {
                return await ai.AnalyzeAsync(bytes, type, ct) is { } g ? Results.Ok(g) : Results.Json(new { error = "AI không phân tích được ảnh này." }, statusCode: 422);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                ai.LogFail(e);
                return Results.Json(new { error = "AI đang lỗi, hãy nhập tay." }, statusCode: 502);
            }
        }).RequireAuthorization().DisableAntiforgery().WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(Bookings.MaxPhotoBytes + 1024 * 1024));
    }

    private void LogFail(Exception e) => log.LogError(e, "Gọi AI phân tích ảnh kiện lỗi");
}
