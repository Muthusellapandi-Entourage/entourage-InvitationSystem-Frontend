using Entourage.Application.DTOs;
using FluentValidation;

namespace Entourage.Application.Validation;

public sealed class CreateGuestTypeRequestValidator : AbstractValidator<CreateGuestTypeRequest>
{
    public CreateGuestTypeRequestValidator()
    {
        RuleFor(request => request.Name).NotEmpty().MaximumLength(80);
    }
}

public sealed class UpdateGuestTypeRequestValidator : AbstractValidator<UpdateGuestTypeRequest>
{
    public UpdateGuestTypeRequestValidator()
    {
        RuleFor(request => request.Name).NotEmpty().MaximumLength(80);
    }
}

public sealed class ReorderGuestTypesRequestValidator : AbstractValidator<ReorderGuestTypesRequest>
{
    public ReorderGuestTypesRequestValidator()
    {
        RuleFor(request => request.Ids).NotNull().Must(ids => ids.Length > 0).WithMessage("Choose the guest categories to reorder.");
    }
}

public sealed class DuplicateDesignRequestValidator : AbstractValidator<DuplicateDesignRequest>
{
    public DuplicateDesignRequestValidator()
    {
        RuleFor(request => request.Category)
            .Must(category => category is "invitation" or "badge")
            .WithMessage("Choose an invitation or a badge design.");
        RuleFor(request => request.DestinationGuestTypeId).NotEmpty();
    }
}

public sealed class SaveGuestRequestValidator : AbstractValidator<SaveGuestRequest>
{
    public SaveGuestRequestValidator()
    {
        RuleFor(request => request.Name).NotEmpty().MaximumLength(120);
        RuleFor(request => request.Email).MaximumLength(256);
        RuleFor(request => request.Position).MaximumLength(200);
        RuleFor(request => request.Email)
            .Must(email => string.IsNullOrWhiteSpace(email) || email.Contains('@'))
            .WithMessage("Enter a valid email address.");
    }
}

public sealed class ReassignGuestsRequestValidator : AbstractValidator<ReassignGuestsRequest>
{
    public ReassignGuestsRequestValidator()
    {
        RuleFor(request => request.GuestIds).NotNull().Must(ids => ids.Length > 0).WithMessage("Select at least one guest.");
        RuleFor(request => request.GuestTypeId).NotEmpty();
    }
}

public sealed class GuestIdsRequestValidator : AbstractValidator<GuestIdsRequest>
{
    public GuestIdsRequestValidator()
    {
        RuleFor(request => request.GuestIds).NotNull().Must(ids => ids.Length > 0 && ids.Length <= 5000).WithMessage("Select between 1 and 5000 guests.");
    }
}

public sealed class ImportGuestsRequestValidator : AbstractValidator<ImportGuestsRequest>
{
    public ImportGuestsRequestValidator()
    {
        RuleFor(request => request.Rows).NotNull().Must(rows => rows.Length > 0 && rows.Length <= 2000)
            .WithMessage("Import between 1 and 2000 rows.");
        RuleForEach(request => request.Rows).ChildRules(row =>
        {
            row.RuleFor(item => item.Row).GreaterThan(0);
            row.RuleFor(item => item.Name).MaximumLength(120);
            row.RuleFor(item => item.Email).MaximumLength(256);
            row.RuleFor(item => item.Position).MaximumLength(200);
            row.RuleFor(item => item.GuestType).MaximumLength(80);
            row.RuleFor(item => item.Group).MaximumLength(120);
        });
    }
}

public sealed class SaveGuestGroupRequestValidator : AbstractValidator<SaveGuestGroupRequest>
{
    public SaveGuestGroupRequestValidator()
    {
        RuleFor(request => request.Name).NotEmpty().WithMessage("Enter a group name.").MaximumLength(120);
    }
}

public sealed class SetGuestRsvpRequestValidator : AbstractValidator<SetGuestRsvpRequest>
{
    public SetGuestRsvpRequestValidator()
    {
        RuleFor(request => request.Status)
            .Must(status => status is "Pending" or "Accepted" or "Declined")
            .WithMessage("Choose Pending, Accepted or Declined.");
    }
}

public sealed class LogGuestActivityRequestValidator : AbstractValidator<LogGuestActivityRequest>
{
    public LogGuestActivityRequestValidator()
    {
        // Only browser-side actions may be logged from the client; everything else is recorded by the server.
        RuleFor(request => request.Kind).Must(kind => kind == "Downloaded").WithMessage("Unknown activity.");
        RuleFor(request => request.Detail).MaximumLength(300);
    }
}

public sealed class MoveGuestsToGroupRequestValidator : AbstractValidator<MoveGuestsToGroupRequest>
{
    public MoveGuestsToGroupRequestValidator()
    {
        RuleFor(request => request.GuestIds).NotNull().Must(ids => ids.Length > 0 && ids.Length <= 5000)
            .WithMessage("Select between 1 and 5000 guests.");
    }
}
