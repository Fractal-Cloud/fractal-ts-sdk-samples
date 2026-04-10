# basic_onprem_openshift

Deploys a complete on-premises **OpenShift** workload showcasing all available component types: network policies, container workloads, services with routes, persistent volumes, and virtual machines via OpenShift Virtualization.

## Components

| Blueprint | OpenShift Offer | Description |
|-----------|----------------|-------------|
| SecurityGroup | OpenshiftSecurityGroup | NetworkPolicy controlling pod traffic |
| Workload × 2 | OpenshiftWorkload | Deployments (nginx frontend + API backend) |
| LoadBalancer | OpenshiftService | ClusterIP Service + Route with TLS edge termination |
| FilesAndBlobs | OpenshiftPersistentVolume | 10Gi PersistentVolume with ReadWriteOnce |
| VirtualMachine | OpenshiftVm | KubeVirt VM (RHEL 9, 2 vCPUs, 4Gi RAM) |

## Running

```bash
npm install
npm run compile

export SERVICE_ACCOUNT_ID="..."
export SERVICE_ACCOUNT_SECRET="..."
export OWNER_ID="..."

node build/src/index.js
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | — | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | — | Fractal Cloud service account secret |
| `OWNER_ID` | yes | — | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | `dev` | kebab-case environment name |
| `OPENSHIFT_NAMESPACE` | no | `app` | Kubernetes namespace for workloads and VM |
| `OPENSHIFT_STORAGE_CLASS` | no | `gp3-csi` | StorageClass name for PV and VM disk |
| `OPENSHIFT_ROUTE_HOSTNAME` | no | — | Custom hostname for the OpenShift Route |
| `OPENSHIFT_VM_IMAGE` | no | `registry.redhat.io/rhel9/rhel-guest-image:latest` | Base image for the KubeVirt VM |
| `OPENSHIFT_SSH_PUBLIC_KEY` | no | — | SSH public key injected into the VM |
