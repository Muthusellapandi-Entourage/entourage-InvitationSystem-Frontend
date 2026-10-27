using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    IAuthService authService,
    ICurrentUser currentUser,
    Entourage.Infrastructure.Authentication.MicrosoftSignInService microsoft) : ControllerBase
{
    /// <summary>Which sign-in methods the login page offers.</summary>
    [AllowAnonymous]
    [HttpGet("options")]
    public ActionResult<ApiResponse<AuthOptionsDto>> Options() => Ok(new ApiResponse<AuthOptionsDto>(true, microsoft.Options()));

    [AllowAnonymous]
    [HttpPost("microsoft")]
    public async Task<ActionResult<ApiResponse<AuthSessionDto>>> MicrosoftSignIn(
        MicrosoftSignInRequest request,
        CancellationToken cancellationToken)
    {
        var session = await microsoft.SignInAsync(request, cancellationToken);
        return Ok(new ApiResponse<AuthSessionDto>(true, session));
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<ApiResponse<AuthSessionDto>>> Login(
        LoginRequest request,
        CancellationToken cancellationToken)
    {
        if (!microsoft.Options().PasswordLogin)
        {
            throw AppException.Forbidden("Sign in with your Microsoft work account.");
        }

        var session = await authService.LoginAsync(request, cancellationToken);
        return Ok(new ApiResponse<AuthSessionDto>(true, session));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<ApiResponse<UserDto>>> Me(CancellationToken cancellationToken)
    {
        var user = await authService.GetCurrentAsync(currentUser.UserId, cancellationToken);
        return Ok(new ApiResponse<UserDto>(true, user));
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<ActionResult<ApiResponse<object>>> Logout(CancellationToken cancellationToken)
    {
        await authService.LogoutAsync(currentUser.UserId, cancellationToken);
        return Ok(new ApiResponse<object>(true, null, "Signed out."));
    }
}
