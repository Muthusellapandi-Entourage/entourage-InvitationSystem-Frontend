namespace Entourage.Application.DTOs;

public sealed record SeatingPlanDto(string? DesignJson, DateTime? UpdatedOn);

public sealed record SaveSeatingPlanRequest(string DesignJson);
