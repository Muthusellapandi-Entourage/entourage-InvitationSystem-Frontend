using Entourage.Application;
using Entourage.Application.Interfaces;

namespace Entourage.Infrastructure.Authentication;

public sealed class CurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    public Guid UserId
    {
        get
        {
            var value = httpContextAccessor.HttpContext?.User.FindFirst("sub")?.Value;
            if (!Guid.TryParse(value, out var userId))
            {
                throw AppException.Unauthorized();
            }

            return userId;
        }
    }
}
