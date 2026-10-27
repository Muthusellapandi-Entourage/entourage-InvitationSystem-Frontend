using System.Text.RegularExpressions;
using Entourage.Application.DTOs;
using Entourage.Application.Invitations;
using Entourage.Application.Validation;
using Entourage.Infrastructure.Services;
using SkiaSharp;
using Xunit;

namespace Entourage.Tests;

public sealed class SlicedInvitationTests
{
    private static readonly Guid Source = Guid.NewGuid();
    private static readonly Guid Header = Guid.NewGuid();
    private static readonly Guid NameStrip = Guid.NewGuid();
    private static readonly Guid Left = Guid.NewGuid();
    private static readonly Guid Accept = Guid.NewGuid();
    private static readonly Guid Decline = Guid.NewGuid();
    private static readonly Guid Right = Guid.NewGuid();

    private static GuestNameImageDto Name(string template = "Dear {name},") =>
        new(template, null, "Arial", 40, "#FFFFFF", "left", "middle", 60, 0, false, null, "Arial", 20, "#FFFFFF", 8);

    private static InvitationDesignDto Design(SliceDesignDto slices) =>
        InvitationDesignDto.CreateDefault() with { Width = 600, Slices = slices };

    private static SliceDesignDto Slices(GuestNameImageDto? name = null, SliceStripDto[]? strips = null) => new(
        Source,
        1200,
        1000,
        strips ??
        [
            new SliceStripDto("image", 0, 400, Header),
            new SliceStripDto("name", 400, 200, NameStrip),
            new SliceStripDto("buttons", 600, 400, null,
            [
                new SlicePieceDto("image", 0, 101, Left),
                new SlicePieceDto("accept", 101, 499, Accept),
                new SlicePieceDto("decline", 600, 499, Decline),
                new SlicePieceDto("image", 1099, 101, Right),
            ]),
        ],
        name ?? Name());

    [Fact]
    public void Sliced_html_uses_name_image_token_and_links_the_buttons()
    {
        var design = Design(Slices());
        var urls = InvitationEmailBuilder.AllAssetIds(design).ToDictionary(id => id, id => $"/api/public/assets/{id}");

        var html = InvitationEmailBuilder.BuildTable(design, urls);

        Assert.Contains("src=\"{{GuestNameImage}}\"", html);
        Assert.Contains("alt=\"{{GuestNameAlt}}\"", html);
        Assert.Contains("href=\"{{AcceptUrl}}\"", html);
        Assert.Contains("href=\"{{DeclineUrl}}\"", html);
        Assert.Contains($"/api/public/assets/{Header}", html);
        // Piece widths are rounded by edge, so they add up to the email width exactly.
        var widths = Regex.Matches(html, "<td width=\"(\\d+)\"").Select(match => int.Parse(match.Groups[1].Value)).ToArray();
        Assert.Equal(4, widths.Length);
        Assert.Equal(600, widths.Sum());
        // Every button piece has the same exact height, so the row lines up (400 source px at 0.5 scale).
        var heights = Regex.Matches(html, "<td width=\"\\d+\" height=\"(\\d+)\"").Select(match => match.Groups[1].Value).Distinct().ToArray();
        Assert.Equal(new[] { "200" }, heights);
    }

    [Fact]
    public void All_asset_ids_include_source_strips_and_pieces()
    {
        var ids = InvitationEmailBuilder.AllAssetIds(Design(Slices()));

        Assert.Equal(new HashSet<Guid> { Source, Header, NameStrip, Left, Accept, Decline, Right }, ids.ToHashSet());
    }

    [Fact]
    public void Validator_accepts_a_complete_slice_design()
    {
        var result = new InvitationDesignValidator().Validate(Design(Slices()));

        Assert.True(result.IsValid, string.Join("; ", result.Errors.Select(error => error.ErrorMessage)));
    }

    [Fact]
    public void Validator_rejects_gaps_missing_name_strip_and_template_without_placeholder()
    {
        var gap = Slices(strips:
        [
            new SliceStripDto("image", 0, 300, Header),
            new SliceStripDto("name", 400, 600, NameStrip),
        ]);
        var noName = Slices(strips: [new SliceStripDto("image", 0, 1000, Header)]);
        var badTemplate = Slices(Name("Dear guest,"));

        var validator = new InvitationDesignValidator();
        Assert.False(validator.Validate(Design(gap)).IsValid);
        Assert.False(validator.Validate(Design(noName)).IsValid);
        Assert.False(validator.Validate(Design(badTemplate)).IsValid);
    }

    [Fact]
    public void Renderer_draws_the_name_on_the_strip_at_the_same_size()
    {
        using var strip = new SKBitmap(1200, 200);
        strip.Erase(new SKColor(20, 30, 60));
        using var image = SKImage.FromBitmap(strip);
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);

        var png = GuestNameRenderer.Render(data.ToArray(), Name(), "Salman K Juma", null, _ => null);

        using var result = SKBitmap.Decode(png);
        Assert.NotNull(result);
        Assert.Equal(1200, result.Width);
        Assert.Equal(200, result.Height);
        // Some pixels became (near) white text; the background is untouched elsewhere.
        var lit = 0;
        for (var x = 0; x < result.Width; x += 2)
        {
            for (var y = 0; y < result.Height; y += 2)
            {
                var pixel = result.GetPixel(x, y);
                if (pixel.Red > 200 && pixel.Green > 200 && pixel.Blue > 200)
                {
                    lit++;
                }
            }
        }

        Assert.True(lit > 50, $"Expected drawn text, found {lit} light pixels.");
        Assert.Equal(new SKColor(20, 30, 60), result.GetPixel(1190, 5));
    }

    [Fact]
    public void Seat_labels_come_from_the_active_floor_like_the_designer()
    {
        var guest = Guid.NewGuid();
        var other = Guid.NewGuid();
        var json = $$"""
            {"activeLayoutId":"b","layouts":[
              {"id":"a","arrangements":[{"id":"t","name":"Old","seats":[{"id":"s","label":"1","guestId":"{{guest}}"}]}]},
              {"id":"b","arrangements":[
                {"id":"t1","name":"Table 1","seats":[{"id":"s1","label":"7","guestId":"{{guest}}"}]},
                {"id":"r","kind":"row","name":"","seats":[{"id":"s2","label":"14","row":"Row 2","guestId":"{{other}}"}]}
              ]}
            ]}
            """;

        var seats = SeatLabels.FromDesignJson(json);

        Assert.Equal("Table 1 · Seat 7", seats[guest]);
        Assert.Equal("Seats · Row 2 · Seat 14", seats[other]);
        Assert.Empty(SeatLabels.FromDesignJson("not json"));
    }

    [Fact]
    public void Greeting_replaces_the_name_placeholder()
    {
        Assert.Equal("Dear Salman K Juma,", GuestNameRenderer.Greeting("Dear {name},", "Salman K Juma"));
    }
}
