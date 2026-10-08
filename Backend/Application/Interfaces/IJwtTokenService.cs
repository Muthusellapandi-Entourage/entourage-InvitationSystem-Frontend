using Entourage.Application.DTOs;
using Entourage.Domain.Entities;

namespace Entourage.Application.Interfaces;

public interface IJwtTokenService
{
    AuthSessionDto CreateSession(User user);
}
