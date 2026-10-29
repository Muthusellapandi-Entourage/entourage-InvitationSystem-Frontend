using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Entourage.Api.Middleware;
using Entourage.Application;
using Entourage.Application.Interfaces;
using Entourage.Infrastructure.Authentication;
using Entourage.Infrastructure.Data;
using Entourage.Infrastructure.Services;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

var jwtSection = builder.Configuration.GetSection(JwtOptions.SectionName);
var jwtOptions = jwtSection.Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwtOptions.Secret) || jwtOptions.Secret.Length < 32)
{
    throw new InvalidOperationException("Jwt:Secret must be configured with at least 32 characters.");
}

if (string.IsNullOrWhiteSpace(jwtOptions.Issuer) || string.IsNullOrWhiteSpace(jwtOptions.Audience))
{
    throw new InvalidOperationException("Jwt:Issuer and Jwt:Audience must be configured.");
}

if (string.IsNullOrWhiteSpace(builder.Configuration.GetConnectionString("DefaultConnection")))
{
    throw new InvalidOperationException("ConnectionStrings:DefaultConnection must be configured.");
}

builder.Services.Configure<JwtOptions>(jwtSection);
builder.Services.Configure<MicrosoftAuthOptions>(builder.Configuration.GetSection(MicrosoftAuthOptions.SectionName));
builder.Services.AddSingleton<MicrosoftKeys>();
builder.Services.AddScoped<MicrosoftSignInService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddValidatorsFromAssemblyContaining<Entourage.Application.Validation.LoginRequestValidator>();
builder.Services.AddSingleton<IPasswordHasher, BcryptPasswordHasher>();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IEventService, EventService>();
builder.Services.AddScoped<IInvitationService, InvitationService>();
builder.Services.AddScoped<IGuestDirectoryService, GuestDirectoryService>();
builder.Services.AddScoped<ISeatingPlanService, SeatingPlanService>();
builder.Services.AddScoped<IGuestGroupService, GuestGroupService>();
builder.Services.AddScoped<IEventFontService, EventFontService>();
builder.Services.AddScoped<GuestNameImageService>();
builder.Services.AddScoped<EventSiteService>();
builder.Services.AddScoped<CheckInService>();
builder.Services.AddScoped<AppleWalletService>();
builder.Services.AddScoped<RsvpDashboardService>();
builder.Services.AddScoped<MicrositeService>();
builder.Services.AddScoped<RsvpPageService>();
builder.Services.AddScoped<FrontDeskService>();
builder.Services.AddScoped<EventAnalyticsService>();
builder.Services.AddScoped<RegistrationService>();
builder.Services.AddScoped<PrintBadgeService>();
// Used only to confirm an event domain reaches this server: short timeout, no cookies.
builder.Services.AddHttpClient(EventSiteService.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(10))
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { UseCookies = false, MaxAutomaticRedirections = 3 });
builder.Services.AddScoped<IMailSettingsService, MailSettingsService>();
builder.Services.AddScoped<IGuestMailer, GuestMailer>();
builder.Services.AddSingleton<SmtpMailTransport>();
builder.Services.AddSingleton<GraphMailTransport>();
builder.Services.AddSingleton<IMailTransport, MailTransportRouter>();
builder.Services.AddHttpClient(GraphMailTransport.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(60));
// Encrypts the saved SMTP password. Keys live in the app's key store, so they survive restarts.
builder.Services.AddDataProtection().SetApplicationName("Entourage.InvitationSystem");
builder.Services.AddScoped<IEventAssetService, EventAssetService>();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<IInvitationPreviewStore, InvitationPreviewStore>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Secret)),
            ClockSkew = TimeSpan.FromMinutes(1),
            NameClaimType = "sub",
            RoleClaimType = "role",
        };
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var userIdValue = context.Principal?.FindFirst("sub")?.Value;
                var stamp = context.Principal?.FindFirst("sst")?.Value;
                if (!Guid.TryParse(userIdValue, out var userId) || string.IsNullOrWhiteSpace(stamp))
                {
                    context.Fail("Unauthorized");
                    return;
                }

                var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(item => item.Id == userId);
                if (user is null || !user.IsActive || user.SecurityStamp != stamp)
                {
                    context.Fail("Unauthorized");
                }
            },
            OnChallenge = async context =>
            {
                context.HandleResponse();
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsJsonAsync(new ApiResponse<object>(
                    false,
                    null,
                    "You need to sign in to continue."));
            },
            OnForbidden = async context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsJsonAsync(new ApiResponse<object>(
                    false,
                    null,
                    "You do not have access to this resource."));
            },
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers(options => options.Filters.Add<Entourage.Api.Filters.ArchivedEventFilter>()).AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var errors = context.ModelState
            .Where(entry => entry.Value?.Errors.Count > 0)
            .ToDictionary(
                entry => string.IsNullOrEmpty(entry.Key)
                    ? "request"
                    : JsonNamingPolicy.CamelCase.ConvertName(entry.Key),
                entry => entry.Value!.Errors
                    .Select(error => string.IsNullOrWhiteSpace(error.ErrorMessage)
                        ? "This value is invalid."
                        : error.ErrorMessage)
                    .ToArray());

        return new BadRequestObjectResult(new ApiResponse<object>(
            false,
            null,
            "Some fields need attention.",
            errors));
    };
});

var allowedOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.AllowAnyHeader().AllowAnyMethod();
        if (builder.Environment.IsDevelopment())
        {
            policy.SetIsOriginAllowed(origin =>
                Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
                (uri.Host is "localhost" or "127.0.0.1"));
        }
        else if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins);
        }
    });
});

var app = builder.Build();

// Behind a reverse proxy that does not pass the original Host header through, turn on
// ReverseProxy:TrustForwardedHeaders so the real host name and scheme are used (needed to recognise
// event domains). Only do this when the app is reachable through that proxy alone.
if (builder.Configuration.GetValue("ReverseProxy:TrustForwardedHeaders", false))
{
    var forwarded = new ForwardedHeadersOptions
    {
        ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor
            | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto
            | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedHost,
    };
    forwarded.KnownNetworks.Clear();
    forwarded.KnownProxies.Clear();
    app.UseForwardedHeaders(forwarded);
}

// Event domains (e.g. excellenceawards2026.com) are answered here with the guest pages only.
app.UseMiddleware<EventSiteMiddleware>();
app.UseCors("Frontend");
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapFallback((HttpContext context) =>
{
    // A guest page requested on a host that is not (yet) an event domain: say which host arrived,
    // so a DNS / proxy / spelling problem is easy to spot.
    var path = context.Request.Path.Value ?? string.Empty;
    if (path.Equals(Entourage.Application.Invitations.EventDomains.InvitationPath, StringComparison.OrdinalIgnoreCase)
        || path.Equals(Entourage.Application.Invitations.EventDomains.RsvpPath, StringComparison.OrdinalIgnoreCase)
        || path.Equals(Entourage.Application.Invitations.EventDomains.CheckPath, StringComparison.OrdinalIgnoreCase))
    {
        return Results.Text(
            $"\"{context.Request.Host.Host}\" is not set up as an event domain on this server. " +
            "Save exactly this address under Event settings → Invitation domain (www. counts as a different address). " +
            "If it is saved, the proxy in front of this server may be changing the host name.",
            "text/plain; charset=utf-8",
            statusCode: StatusCodes.Status404NotFound);
    }

    return Results.Json(
        new ApiResponse<object>(false, null, $"The requested resource was not found ({context.Request.Method} {path})."),
        statusCode: StatusCodes.Status404NotFound);
});

await DatabaseInitializer.MigrateAndSeedAsync(app.Services, app.Environment);

app.Run();
