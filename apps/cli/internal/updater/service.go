package updater

import (
	"context"

	updaterv1 "github.com/trymetis/metis/apps/cli/gen/metis/updater/v1"
	"github.com/trymetis/metis/apps/cli/gen/metis/updater/v1/updaterv1connect"
)

type Service struct {
	manager *Manager
}

var _ updaterv1connect.UpdaterServiceHandler = Service{}

func NewService(manager *Manager) Service {
	return Service{manager: manager}
}

func (service Service) GetStatus(ctx context.Context, _ *updaterv1.GetStatusRequest) (*updaterv1.GetStatusResponse, error) {
	return service.manager.Status(ctx)
}

func (service Service) StartUpgrade(ctx context.Context, req *updaterv1.StartUpgradeRequest) (*updaterv1.StartUpgradeResponse, error) {
	upgrade, err := service.manager.Upgrade(ctx, req.GetVersion(), req.GetRequestedBy(), UpgradeOptions{})
	if err != nil {
		return nil, err
	}
	return &updaterv1.StartUpgradeResponse{Upgrade: upgrade}, nil
}

func (service Service) GetUpgrade(context.Context, *updaterv1.GetUpgradeRequest) (*updaterv1.GetUpgradeResponse, error) {
	return &updaterv1.GetUpgradeResponse{Upgrade: service.manager.Last()}, nil
}

func (service Service) Rollback(_ context.Context, req *updaterv1.RollbackRequest) (*updaterv1.RollbackResponse, error) {
	upgrade, err := service.manager.Rollback(req.GetRequestedBy())
	if err != nil {
		return nil, err
	}
	return &updaterv1.RollbackResponse{Upgrade: upgrade}, nil
}
