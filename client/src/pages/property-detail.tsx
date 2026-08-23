import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, MapPin, KeyRound, Clock, Users, BedDouble, Bath, DollarSign,
  Pencil, ImagePlus, ClipboardList, Building2,
} from "lucide-react";
import type { Property, Customer } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PropertyFormDialog } from "@/components/properties/property-form-dialog";
import { formatMoney } from "@/lib/format";

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const propertyId = Number(params.id);
  const [editOpen, setEditOpen] = useState(false);

  const { data: property, isLoading } = useQuery<Property>({
    queryKey: ["/api/properties", propertyId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/properties/${propertyId}`);
      return res.json();
    },
  });

  const { data: customer } = useQuery<Customer>({
    queryKey: ["/api/customers", property?.customerId],
    enabled: !!property,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/customers/${property!.customerId}`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Property not found.</p>
        <Link href="/properties" className="text-sm text-primary hover:underline">
          Back to Properties
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Link href="/properties">
          <Button size="icon" variant="ghost" data-testid="button-back-properties">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold flex-1 truncate" data-testid="text-property-name">
          {property.name}
        </h1>
        <Badge variant="outline" className="capitalize">{property.unitType}</Badge>
        {property.active ? (
          <Badge variant="outline" className="bg-status-completed-bg text-status-completed border-transparent">Active</Badge>
        ) : (
          <Badge variant="outline" className="bg-status-canceled-bg text-status-canceled border-transparent">Inactive</Badge>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditOpen(true)} data-testid="button-edit-property">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>

      {customer && (
        <Link
          href={`/customers/${customer.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
          data-testid="link-property-customer"
        >
          <Building2 className="h-3.5 w-3.5" /> {customer.name}
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p>{property.addressLine1}</p>
                {property.addressLine2 && <p>{property.addressLine2}</p>}
                <p>{property.city}, {property.state} {property.zip}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Stay Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <BedDouble className="h-4 w-4 text-muted-foreground" />
              <span className="tabular-nums">{property.bedrooms} bedrooms</span>
            </div>
            <div className="flex items-center gap-2">
              <Bath className="h-4 w-4 text-muted-foreground" />
              <span className="tabular-nums">{property.bathrooms} bathrooms</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="tabular-nums">Max {property.maxOccupancy} guests</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="tabular-nums">In {property.checkInTime} / Out {property.checkOutTime}</span>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="tabular-nums">{formatMoney(property.basePrice)} base</span>
              <Badge variant="secondary" className="capitalize ml-1">{property.cleaningFrequency}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sensitive entry instructions — visually flagged */}
      <Card className="border-status-partial/40 bg-status-partial-bg/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-status-partial" />
            Entry Instructions
            <Badge variant="outline" className="ml-1 border-status-partial/50 text-status-partial">Sensitive</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <p data-testid="text-entry-instructions">{property.entryInstructions}</p>
          {property.accessNotes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Access Notes</p>
              <p>{property.accessNotes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {property.supplyNotes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Supply Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{property.supplyNotes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Photos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <button
                key={i}
                className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-md border border-dashed text-muted-foreground hover-elevate"
                data-testid={`button-add-photo-${i}`}
              >
                <ImagePlus className="h-5 w-5" />
                <span className="text-xs">Add Photo</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Job History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-8 text-center" data-testid="empty-job-history">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No job history yet. Jobs will appear here once Scheduling/Jobs launches in Phase 2.
            </p>
          </div>
        </CardContent>
      </Card>

      <PropertyFormDialog open={editOpen} onOpenChange={setEditOpen} property={property} />
    </div>
  );
}
