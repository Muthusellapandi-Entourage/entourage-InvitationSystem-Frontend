using System.Text.Json;
using Entourage.Application.DTOs;
using FluentValidation;

namespace Entourage.Application.Validation;

public sealed class SaveSeatingPlanRequestValidator : AbstractValidator<SaveSeatingPlanRequest>
{
    public SaveSeatingPlanRequestValidator()
    {
        RuleFor(request => request.DesignJson)
            .NotEmpty()
            .MaximumLength(1_000_000)
            .Must(BeObject)
            .WithMessage("The seating plan is not valid.");
    }

    private static bool BeObject(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.ValueKind == JsonValueKind.Object;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
